// COPIES of createBooking, createServiceRequest and cancelCustomerRequest handler bodies in customer.functions.ts
// (additive, for the native iOS endpoints only). The website handlers are intentionally NOT modified.
// If those handlers change, these copies must be updated to match.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { z } from "zod";
import type { bookingInput, serviceInput } from "./customer-rules";
import { canCustomerCancel } from "./customer-rules";
import type { RequestKind } from "./dashboard-rules";
import { TIME_SLOTS } from "./labels";

type Db = SupabaseClient<Database>;

export async function bookingCore(params: {
  data: z.infer<typeof bookingInput>;
  supabase: Db;
  userId: string;
}) {
  const { data, supabase, userId } = params;
  const store = await supabase
    .from("stores")
    .select("id,name,owner_id,category,is_active,is_open")
    .eq("id", data.store_id)
    .single();
  if (!store.data?.is_active || !store.data.is_open || store.data.category !== "doctors")
    throw new Error("الطبيب غير متاح للحجز");
  if (!TIME_SLOTS.includes(data.booking_time)) throw new Error("اختر موعدًا صحيحًا");
  const result = await supabase
    .from("bookings")
    .insert({ ...data, customer_id: userId })
    .select("id")
    .single();
  if (result.error) throw new Error("تعذر الحجز؛ تأكد من التاريخ وحاول مرة أخرى");

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendNotificationWithPush } = await import("@/lib/push.functions");
    const dbStore = await supabaseAdmin
      .from("stores")
      .select("id, name, owner_id")
      .eq("id", data.store_id)
      .maybeSingle();
    const ownerId = dbStore.data?.owner_id || store.data?.owner_id;
    if (ownerId) {
      const docTitle = `🩺 حجز موعد جديد (${dbStore.data?.name || store.data.name || "العيادة"})`;
      const docBody = `حجز جديد بتاريخ ${data.booking_date} الساعة ${data.booking_time} باسم المريض: ${data.patient_name} (${data.phone})`;
      await sendNotificationWithPush({
        userId: ownerId,
        title: docTitle,
        body: docBody,
        path: "/provider?tab=bookings",
        tag: `husayniya-booking-${result.data.id}`,
      });
    }
  } catch (err) {
    console.error("Failed to dispatch booking push:", err);
  }

  return result.data;
}

export async function serviceRequestCore(params: {
  data: z.infer<typeof serviceInput>;
  supabase: Db;
  userId: string;
}) {
  const { data, supabase, userId } = params;
  const store = await supabase
    .from("stores")
    .select("id,name,owner_id,category,is_active,is_open")
    .eq("id", data.store_id)
    .single();
  if (
    !store.data?.is_active ||
    !store.data.is_open ||
    !["maintenance", "home"].includes(store.data.category)
  )
    throw new Error("مقدم الخدمة غير متاح");
  if (data.image_paths.some((p) => !p.startsWith(`${userId}/`) || p.includes("..")))
    throw new Error("صور غير صالحة");
  const result = await supabase
    .from("service_requests")
    .insert({
      store_id: data.store_id,
      description: data.description + (data.notes ? `\n${data.notes}` : ""),
      address: data.address,
      phone: data.phone,
      area_id: data.area_id,
      preferred_date: data.preferred_date,
      image_paths: data.image_paths,
      customer_id: userId,
    })
    .select("id")
    .single();
  if (result.error) throw new Error("تعذر إرسال طلب الخدمة");

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendNotificationWithPush } = await import("@/lib/push.functions");
    const dbStore = await supabaseAdmin
      .from("stores")
      .select("id, name, owner_id")
      .eq("id", data.store_id)
      .maybeSingle();
    const ownerId = dbStore.data?.owner_id || store.data?.owner_id;
    if (ownerId) {
      const srvTitle = `🔧 طلب صيانة جديد (${dbStore.data?.name || store.data.name || "مقدم الخدمة"})`;
      const srvBody = `طلب جديد من ${data.phone} - العنوان: ${data.address}`;
      await sendNotificationWithPush({
        userId: ownerId,
        title: srvTitle,
        body: srvBody,
        path: "/provider?tab=services",
        tag: `husayniya-service-${result.data.id}`,
      });
    }
  } catch (err) {
    console.error("Failed to dispatch service push:", err);
  }

  return result.data;
}

export async function cancelRequestCore(params: {
  data: { kind: RequestKind; id: string };
  supabase: Db;
  userId: string;
}) {
  const { data, supabase, userId } = params;
  const row = await supabase
    .from(data.kind)
    .select("store_id,status")
    .eq("id", data.id)
    .eq("customer_id", userId)
    .single();
  if (!row.data || !canCustomerCancel(data.kind, row.data.status))
    throw new Error("لا يمكن إلغاء الطلب في حالته الحالية");
  const result = await supabase
    .from(data.kind)
    .update({ status: "cancelled" })
    .eq("id", data.id)
    .eq("customer_id", userId)
    .eq("status", row.data.status)
    .select("id")
    .single();
  if (result.error) throw new Error("تعذر الإلغاء؛ حدّث الطلب وحاول مرة أخرى");

  if (data.kind === "orders") {
    try {
      const { notifyOrderStatusUpdate } = await import("@/lib/chat.functions");
      await notifyOrderStatusUpdate(data.id, "cancelled", { cancelledBy: "customer" });
    } catch (e) {
      console.error("cancel notification error:", e);
    }
  } else if (data.kind === "bookings") {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendNotificationWithPush } = await import("@/lib/push.functions");
      const store = await supabaseAdmin
        .from("stores")
        .select("name, owner_id")
        .eq("id", row.data.store_id)
        .maybeSingle();
      if (store.data?.owner_id) {
        await sendNotificationWithPush({
          userId: store.data.owner_id,
          title: `❌ إلغاء حجز موعد من قِبل المريض (${store.data.name})`,
          body: `قام المريض بإلغاء موعد الحجز في العيادة.`,
          path: "/provider?tab=bookings",
          tag: `husayniya-booking-cancel-${data.id}`,
        });
      }
    } catch (e) {
      console.error("Booking cancel notification error:", e);
    }
  } else if (data.kind === "service_requests") {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendNotificationWithPush } = await import("@/lib/push.functions");
      const store = await supabaseAdmin
        .from("stores")
        .select("name, owner_id")
        .eq("id", row.data.store_id)
        .maybeSingle();
      if (store.data?.owner_id) {
        await sendNotificationWithPush({
          userId: store.data.owner_id,
          title: `❌ إلغاء طلب خدمة من قِبل العميل (${store.data.name})`,
          body: `قام العميل بإلغاء طلب الخدمة المنزلية.`,
          path: "/provider?tab=services",
          tag: `husayniya-service-cancel-${data.id}`,
        });
      }
    } catch (e) {
      console.error("Service cancel notification error:", e);
    }
  }

  return result.data;
}
