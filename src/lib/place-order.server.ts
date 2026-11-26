// COPY of the placeCustomerOrder handler body in customer.functions.ts (additive, for the native iOS endpoint only).
// The website handler is intentionally NOT modified. If placeCustomerOrder changes, this copy must be updated to match.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { z } from "zod";
import type { checkoutInput } from "./customer-rules";
import { formatOrderPushPayload } from "./push-rules";

export type PlaceOrderInput = z.infer<typeof checkoutInput>;

export async function placeOrderCore(params: {
  data: PlaceOrderInput;
  supabase: SupabaseClient<Database>;
  userId: string;
}): Promise<{ id: unknown }> {
  const { data, supabase, userId } = params;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { REAL_STORES, REAL_SECTIONS, REAL_PRODUCTS } = await import("./real-stores-data");

  // 1. Ensure store exists in DB (auto-seed if it's a curated store)
  const store = await supabase
    .from("stores")
    .select("id,name,owner_id,is_active,is_open,description,category,delivery_fee,commission_rate")
    .eq("id", data.store_id)
    .maybeSingle();

  if (!store.data) {
    throw new Error("المتجر غير متاح أو تم حذفه");
  }

  const { isStoreCurrentlyOpen } = await import("./store-hours");
  const workingStatus = isStoreCurrentlyOpen(store.data);

  if (
    !store.data?.is_active ||
    !workingStatus.isOpen ||
    ["doctors", "maintenance", "home"].includes(store.data.category)
  ) {
    throw new Error(workingStatus.reason || "المتجر غير متاح للطلب الآن");
  }

  // التحقق من وجود دليفري شغال في الوقت الحالي
  const activeDrivers = await supabaseAdmin
    .from("drivers")
    .select("user_id", { count: "exact", head: true })
    .eq("is_active", true);

  if (!activeDrivers.count || activeDrivers.count === 0) {
    throw new Error("لا يوجد توصيل في الوقت الحالي، جميع كباتن التوصيل غير متاحين الآن");
  }

  // 2. Normalize and resolve item product IDs (supports both legacy 35-char and new 36-char IDs)
  const storeSuffix = data.store_id.replace(/^.*-(\d{3,4})$/, "$1").padStart(4, "0");
  const resolvedItems = data.items.map((item) => {
    let pid = item.product_id;
    const legacyMatch = pid.match(/^20000000-0000-0000-0000-0{9,11}(\d+)$/);
    if (legacyMatch) {
      const prodNum = String(Number(legacyMatch[1])).padStart(12, "0");
      pid = `40000000-0000-0000-${storeSuffix}-${prodNum}`;
    }
    return { ...item, product_id: pid };
  });

  // 3. Ensure sections and products exist in DB for this store so Postgres foreign keys and checks pass
  const resolvedIds = resolvedItems.map((i) => i.product_id);
  const dbProducts = await supabase
    .from("products")
    .select("id,is_available,price")
    .eq("store_id", data.store_id)
    .in("id", resolvedIds);

  const existingIds = new Set((dbProducts.data ?? []).map((p: any) => p.id));
  const missing = resolvedItems.filter((i) => !existingIds.has(i.product_id));

  if (missing.length > 0) {
    // Seed sections first to satisfy foreign key constraints
    const staticSections = REAL_SECTIONS.filter((sec) => sec.store_id === data.store_id);
    if (staticSections.length > 0) {
      await supabaseAdmin
        .from("store_sections")
        .upsert(staticSections, { onConflict: "id", ignoreDuplicates: true });
    }

    // Seed products from REAL_PRODUCTS
    const staticStoreProds = REAL_PRODUCTS.filter((p) => p.store_id === data.store_id);
    if (staticStoreProds.length > 0) {
      await supabaseAdmin.from("products").upsert(
        staticStoreProds.map((p) => ({
          id: p.id,
          store_id: p.store_id,
          section_id: p.section_id,
          name: p.name,
          description: p.description,
          price: p.price,
          is_available: p.is_available,
          image_url: p.image_url,
        })),
        { onConflict: "id", ignoreDuplicates: true },
      );
    }
  }

  // 4. Place order via database function
  const args = {
    _store_id: data.store_id,
    _items: resolvedItems,
    _address: data.address,
    _phone: data.phone,
    _notes: data.notes,
    ...(data.area_id !== null ? { _area_id: data.area_id } : {}),
  };
  const result = await supabase.rpc("place_order", args as typeof args & { _area_id: number });
  if (result.error || !result.data) {
    console.error("place_order error:", result.error);
    throw new Error("تعذر إرسال الطلب؛ تحقق من توفر المنتجات وحاول مرة أخرى");
  }

  const orderId = String(result.data);
  const shortId = orderId.slice(0, 8);
  const totalItemsCount = resolvedItems.reduce((acc, it) => acc + (it.quantity || 1), 0);

  // Fetch store record via admin client to ensure owner_id is never restricted by RLS
  const dbStore = await supabaseAdmin
    .from("stores")
    .select("id, name, owner_id")
    .eq("id", data.store_id)
    .maybeSingle();

  const storeName = dbStore.data?.name || store.data.name || "المتجر";
  const storeOwnerId = dbStore.data?.owner_id || store.data.owner_id;

  // 5. Send real-time in-app notification & Web Push to store owner (or admins)
  try {
    const { sendNotificationWithPush } = await import("@/lib/push.functions");
    const orderPayload = formatOrderPushPayload({
      orderId,
      storeName,
      itemsCount: totalItemsCount,
      phone: data.phone,
      address: data.address,
      notes: data.notes,
    });

    if (storeOwnerId) {
      // Send both in-app notification and Web Push to store owner's mobile/desktop
      await sendNotificationWithPush({
        userId: storeOwnerId,
        title: orderPayload.title,
        body: orderPayload.body,
        path: orderPayload.path,
        tag: orderPayload.tag,
      });
    } else {
      // Fallback for store without an assigned owner: notify platform administrators
      const adminRoles = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (adminRoles.data && adminRoles.data.length > 0) {
        for (const admin of adminRoles.data) {
          await sendNotificationWithPush({
            userId: admin.user_id,
            title: `🛍️ طلب جديد للمتجر (${storeName})`,
            body: orderPayload.body,
            path: `/admin?tab=orders&order=${orderId}`,
            tag: orderPayload.tag,
          });
        }
      }
    }

    // Customer in-app and push order confirmation (فقط للعميل وليس لصاحب المتجر إذا كان يختبر من حسابه)
    if (userId !== storeOwnerId) {
      await sendNotificationWithPush({
        userId: userId,
        title: `🛍️ تم تأكيد إرسال طلبك إلى ${storeName}`,
        body: `طلبك رقم #${shortId} قيد المراجعة لدى المتجر. سنوافيك بإشعار فور بدء التحضير.`,
        path: `/orders?filter=active&chat=${orderId}`,
        tag: `husayniya-order-cust-${orderId}`,
      });
    }
  } catch (notifErr) {
    console.error("Failed to dispatch order notification/push:", notifErr);
  }

  return { id: result.data };
}
