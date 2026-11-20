import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { driverInput } from "./delivery-rules";

const orderSelect = "id, customer_id, status, total, subtotal, delivery_fee, address, phone, notes, area_id, created_at, picked_up_at, delivered_at, driver_id, order_items(name, qty, price), stores(name, phone, address, area_id)";

export const getDriverBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const me = await db.from("drivers").select("*").eq("user_id", context.userId).maybeSingle();
    if (me.error) throw new Error(me.error.message);
    if (!me.data) return { driver: null, available: [], mine: [], areas: [] };
    const [available, mine, areas] = await Promise.all([
      me.data.is_active
        ? db.from("orders").select(orderSelect).is("driver_id", null).eq("status", "preparing").order("created_at")
        : Promise.resolve({ data: [] as any[], error: null }),
      db.from("orders").select(orderSelect).eq("driver_id", context.userId).order("created_at", { ascending: false }).limit(200),
      db.from("areas").select("*"),
    ]);
    for (const r of [available, mine, areas]) if (r.error) throw new Error(r.error.message);

    const rawAvailable = (available.data ?? []) as any[];
    const rawMine = (mine.data ?? []) as any[];

    const customerIds = Array.from(
      new Set([...rawAvailable, ...rawMine].map((o) => o.customer_id).filter(Boolean))
    );
    const profilesMap = new Map<string, string>();
    if (customerIds.length > 0) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name")
          .in("id", customerIds);
        if (profs) {
          profs.forEach((p) => {
            if (p.full_name) profilesMap.set(p.id, p.full_name);
          });
        }
      } catch (e) {
        console.warn("Could not fetch customer profiles for delivery board:", e);
      }
    }

    const attachCustomer = (orderList: any[]) =>
      orderList.map((o) => ({
        ...o,
        customer_name: profilesMap.get(o.customer_id) || "العميل",
      }));

    return {
      driver: me.data,
      available: attachCustomer(rawAvailable),
      mine: attachCustomer(rawMine),
      areas: areas.data ?? [],
    };
  });

export const setMyDriverWorkingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ is_active: z.boolean() }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const driver = await supabaseAdmin.from("drivers").select("user_id").eq("user_id", context.userId).maybeSingle();
    if (!driver.data) throw new Error("حسابك غير مسجل ككابتن توصيل");

    // Block driver from deactivating shift if they currently have active orders on the way
    if (!data.is_active) {
      const activeOrders = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("driver_id", context.userId)
        .eq("status", "on_the_way");
      if (activeOrders.data && activeOrders.data.length > 0) {
        throw new Error(`لا يمكنك إيقاف الوردية أثناء وجود ${activeOrders.data.length} طلب قيد التوصيل في عهدتك. يجب تسليم أو إنهاء الطلبات أولاً.`);
      }
    }

    const r = await supabaseAdmin.from("drivers").update({ is_active: data.is_active }).eq("user_id", context.userId);
    if (r.error) throw new Error(r.error.message);
    return { ok: true, is_active: data.is_active };
  });

export const getDeliveryOrderCallDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ orderId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check if user is active driver or admin
    const [driverCheck, adminCheck] = await Promise.all([
      supabaseAdmin.from("drivers").select("is_active").eq("user_id", context.userId).maybeSingle(),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);

    if (!driverCheck.data?.is_active && !adminCheck.data) {
      throw new Error("لا تملك صلاحية استلام هذا الطلب أو أنك خارج الوردية");
    }

    const orderRes = await supabaseAdmin
      .from("orders")
      .select("id, status, total, subtotal, delivery_fee, address, phone, notes, created_at, store_id, customer_id, driver_id, stores(name, address, phone, specialty), order_items(name, qty, price)")
      .eq("id", data.orderId)
      .maybeSingle();

    if (!orderRes.data) throw new Error("الطلب غير موجود");
    const order = orderRes.data;

    let customerName = "العميل";
    if (order.customer_id) {
      const profile = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", order.customer_id)
        .maybeSingle();
      if (profile.data?.full_name) {
        customerName = profile.data.full_name;
      }
    }

    const store = (order.stores as any) || {};

    return {
      id: order.id,
      status: order.status,
      driver_id: order.driver_id,
      total: Number(order.total || 0),
      subtotal: Number(order.subtotal ?? (Number(order.total || 0) - Number(order.delivery_fee || 0))),
      delivery_fee: Number(order.delivery_fee || 0),
      address: order.address,
      phone: order.phone,
      customer_name: customerName,
      notes: order.notes,
      created_at: order.created_at,
      store_id: order.store_id,
      store_name: store.name || "المتجر",
      store_address: store.address || "العنوان غير مسجل",
      store_phone: store.phone || null,
      items: (order.order_items as any[]) ?? [],
    };
  });

export const claimOrder = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.rpc("driver_claim_order", { _order_id: data.id });
    if (r.error) throw new Error(r.error.message);

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const dr = await supabaseAdmin.from("drivers").select("full_name").eq("user_id", context.userId).maybeSingle();
      const { notifyOrderStatusUpdate } = await import("@/lib/chat.functions");
      await notifyOrderStatusUpdate(data.id, "on_the_way", { driverName: dr.data?.full_name || undefined });
    } catch (e) {
      console.error("claimOrder notification error:", e);
    }

    return { ok: true };
  });

export const completeOrder = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.rpc("driver_complete_order", { _order_id: data.id });
    if (r.error) throw new Error(r.error.message);

    try {
      const { notifyOrderStatusUpdate } = await import("@/lib/chat.functions");
      await notifyOrderStatusUpdate(data.id, "delivered");
    } catch (e) {
      console.error("completeOrder notification error:", e);
    }

    return { ok: true };
  });

async function assertAdmin(db: any, userId: string) {
  const role = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (role.error || !role.data) throw new Error("هذه الصفحة مخصصة للإدارة فقط");
}

export const getDrivers = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const [drivers, orders] = await Promise.all([
      db.from("drivers").select("*").order("created_at", { ascending: false }),
      db.from("orders").select("driver_id, status, total, delivery_fee").not("driver_id", "is", null),
    ]);
    if (drivers.error) throw new Error(drivers.error.message);
    if (orders.error) throw new Error(orders.error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const users = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const emails = new Map((users.data?.users ?? []).map(u => [u.id, u.email ?? ""]));
    return (drivers.data ?? []).map(d => {
      const list = (orders.data ?? []).filter(o => o.driver_id === d.user_id);
      const done = list.filter(o => o.status === "delivered");
      return { ...d, email: emails.get(d.user_id) ?? "", active: list.filter(o => o.status === "on_the_way").length, delivered: done.length, cash: done.reduce((s, o) => s + Number(o.total), 0) };
    });
  });

export const saveDriver = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(driverInput)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    let targetEmail = data.email.trim();
    if (!targetEmail.includes("@")) {
      const { normalizePhone } = await import("@/lib/auth.functions");
      const cleanPhone = normalizePhone(targetEmail);
      if (cleanPhone.length >= 8) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          const list = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
          const found = list.data?.users?.find(
            (u) =>
              u.user_metadata?.phone === cleanPhone ||
              u.phone === cleanPhone ||
              u.email?.startsWith(`${cleanPhone}@`)
          );
          if (found?.email) {
            targetEmail = found.email;
          } else {
            targetEmail = `${cleanPhone}@phone.husayniya.app`;
          }
        } catch {
          targetEmail = `${cleanPhone}@phone.husayniya.app`;
        }
      }
    }
    const r = await context.supabase.rpc("admin_save_driver", { _email: targetEmail, _full_name: data.full_name, _phone: data.phone, _active: data.is_active });
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });

export const setDriverActive = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ user_id: z.string().uuid(), is_active: z.boolean() }))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await supabaseAdmin.from("drivers").update({ is_active: data.is_active }).eq("user_id", data.user_id);
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });

export const updateDriverLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      orderId: z.string().uuid(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const orderRes = await supabaseAdmin
      .from("orders")
      .select("id, driver_id, status, notes")
      .eq("id", data.orderId)
      .maybeSingle();

    if (!orderRes.data) throw new Error("الطلب غير موجود");
    if (orderRes.data.driver_id !== context.userId) {
      throw new Error("لا تملك صلاحية تحديث موقع هذا الطلب");
    }

    // Only update live GPS if order is actively on the way
    if (orderRes.data.status !== "on_the_way") {
      return { ok: true, ignored: true };
    }

    const now = Date.now();
    const tag = `<!-- DRIVER_GPS:${data.lat.toFixed(6)},${data.lng.toFixed(6)},${now} -->`;
    const currentNotes = orderRes.data.notes || "";
    let newNotes = currentNotes;

    if (/<!--\s*DRIVER_GPS:[\s\S]*?-->/i.test(newNotes)) {
      newNotes = newNotes.replace(/<!--\s*DRIVER_GPS:[\s\S]*?-->/i, tag);
    } else {
      newNotes = newNotes ? `${newNotes}\n${tag}` : tag;
    }

    const updateRes = await supabaseAdmin
      .from("orders")
      .update({ notes: newNotes })
      .eq("id", data.orderId);

    if (updateRes.error) throw new Error("تعذر حفظ إحداثيات موقع السائق");

    return {
      ok: true,
      lat: data.lat,
      lng: data.lng,
      updatedAt: now,
    };
  });

export const getDriverLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      orderId: z.string().uuid(),
    })
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const orderRes = await supabaseAdmin
      .from("orders")
      .select("id, status, customer_id, driver_id, notes, address, store_id, stores(name, address, phone)")
      .eq("id", data.orderId)
      .maybeSingle();

    if (!orderRes.data) throw new Error("الطلب غير موجود");

    const isCustomer = orderRes.data.customer_id === context.userId;
    const isDriver = orderRes.data.driver_id === context.userId;

    if (!isCustomer && !isDriver) {
      const roleCheck = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!roleCheck.data) {
        throw new Error("غير مصرح لك بتتبع موقع هذا الطلب");
      }
    }

    // Fetch driver details if assigned
    let driverInfo: { name: string; phone: string | null } | null = null;
    if (orderRes.data.driver_id) {
      const dr = await supabaseAdmin
        .from("drivers")
        .select("full_name, phone")
        .eq("user_id", orderRes.data.driver_id)
        .maybeSingle();
      if (dr.data) {
        driverInfo = {
          name: dr.data.full_name,
          phone: dr.data.phone || null,
        };
      }
    }

    const { extractDriverCoordinates, extractCoordinates } = await import("@/lib/map-utils");
    const driverCoords = extractDriverCoordinates(orderRes.data.notes);
    const customerCoords = extractCoordinates(orderRes.data.address);
    const storeAddress = (orderRes.data.stores as any)?.address;
    const storeCoords = extractCoordinates(storeAddress);

    return {
      orderId: data.orderId,
      status: orderRes.data.status,
      driverCoords,
      customerCoords,
      storeCoords,
      customerAddress: orderRes.data.address,
      storeName: (orderRes.data.stores as any)?.name ?? "المتجر",
      storePhone: (orderRes.data.stores as any)?.phone ?? null,
      driverInfo,
    };
  });
