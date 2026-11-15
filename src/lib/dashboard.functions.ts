import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  storeInput,
  transferStoreOwnershipInput,
  productInput,
  sectionInput,
  commissionInput,
  requestKinds,
  allowedNext,
  catalogImportInput,
  deleteStoreInput,
  storeVisibilityInput,
  storeDeletionRequestInput,
  cancelStoreDeletionRequestInput,
  reviewStoreDeletionRequestInput,
} from "./dashboard-rules";
import { CATALOG_GROUPS, catalogItem, catalogImage } from "./supermarket-catalog";
import { suggestedSectionsFor } from "./product-sections";
import { REAL_STORES, REAL_SECTIONS, REAL_PRODUCTS } from "./real-stores-data";

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ admin: z.boolean() }))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    if (data.admin) {
      const role = await db.rpc("has_role", { _user_id: context.userId, _role: "admin" });
      if (role.error || !role.data) throw new Error("هذه اللوحة مخصصة للإدارة فقط");
    }
    let storesQuery = db.from("stores").select("*").order("created_at", { ascending: false });
    if (!data.admin) storesQuery = storesQuery.eq("owner_id", context.userId);
    const stores = await storesQuery;
    if (stores.error) throw new Error(stores.error.message);
    
    // Filter out dummy demo stores and merge real stores for admin
    const rawStores = (stores.data ?? []).filter(s => !s.name.includes('(تجريبي)'));
    let mergedStores = rawStores;
    if (rawStores.length === 0 && data.admin) {
      mergedStores = REAL_STORES.map(s => ({ ...s, owner_id: null, created_at: new Date().toISOString() })) as any;
    }
    const ids = mergedStores.map(s => s.id);
    const [categories, areas, orders, bookings, services] = await Promise.all([
      db.from("categories").select("*").order("sort"),
      db.from("areas").select("*").order("id"),
      db.from("orders").select("*").in("store_id", ids).order("created_at", { ascending: false }),
      db.from("bookings").select("*").in("store_id", ids).order("created_at", { ascending: false }),
      db.from("service_requests").select("*").in("store_id", ids).order("created_at", { ascending: false }),
    ]);
    for (const result of [categories, areas, orders, bookings, services]) {
      if (result.error) throw new Error(result.error.message);
    }

    let userProfiles: { id: string; email: string; name: string }[] = [];
    const userEmailMap = new Map<string, string>();
    const userNameMap = new Map<string, string>();

    if (data.admin) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [usersRes, profilesRes] = await Promise.all([
          supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
          supabaseAdmin.from("profiles").select("id, full_name, phone"),
        ]);
        const profilesMap = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p.full_name]));

        const users = usersRes.data?.users ?? [];
        users.forEach((u: any) => {
          const profileName = profilesMap.get(u.id);
          const metaName = (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || "";
          const name = profileName || metaName || (u.email ? u.email.split("@")[0] : "");
          if (u.email) {
            userEmailMap.set(u.id, u.email);
            userNameMap.set(u.id, name);
            userProfiles.push({ id: u.id, email: u.email, name });
          }
        });
      } catch (e) {
        console.error("Error fetching users for admin dashboard:", e);
      }
    }

    let storeDeletionRequests: {
      id: string;
      store_id: string;
      owner_id: string;
      store_name: string;
      reason: string;
      status: "pending" | "approved" | "rejected";
      admin_notes?: string | null;
      created_at: string;
      reviewed_at?: string | null;
      owner_email?: string | null;
      owner_name?: string | null;
    }[] = [];

    try {
      let delQuery = db.from("store_deletion_requests" as any).select("*").order("created_at", { ascending: false });
      if (!data.admin) {
        delQuery = delQuery.eq("owner_id", context.userId);
      }
      const delRes = await delQuery;
      if (!delRes.error && delRes.data) {
        storeDeletionRequests = (delRes.data as any[]).map(r => ({
          ...r,
          owner_email: r.owner_id ? (userEmailMap.get(r.owner_id) ?? null) : null,
          owner_name: r.owner_id ? (userNameMap.get(r.owner_id) ?? null) : null,
        }));
      }
    } catch (e) {
      console.warn("Could not fetch store deletion requests:", e);
    }

    const enrichedStores = mergedStores.map(s => ({
      ...s,
      owner_email: s.owner_id ? (userEmailMap.get(s.owner_id) ?? null) : null,
      owner_name: s.owner_id ? (userNameMap.get(s.owner_id) ?? null) : null,
      hasPendingDeletion: storeDeletionRequests.some(r => r.store_id === s.id && r.status === "pending"),
    }));

    return {
      stores: enrichedStores,
      registeredUsers: userProfiles,
      categories: categories.data ?? [],
      areas: areas.data ?? [],
      orders: orders.data ?? [],
      bookings: bookings.data ?? [],
      services: services.data ?? [],
      storeDeletionRequests,
    };
  });

export const getDashboardProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ storeId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const roleCheck = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const isAdmin = !!roleCheck.data;
    if (!isAdmin) {
      const store = await context.supabase
        .from("stores")
        .select("id")
        .eq("id", data.storeId)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (store.error || !store.data) throw new Error("لا تملك صلاحية عرض منتجات هذا المتجر");
    }
    const result = await context.supabase
      .from("products")
      .select("*")
      .eq("store_id", data.storeId)
      .order("created_at", { ascending: false });
    if (result.error) throw new Error(result.error.message);
    const dbProds = result.data ?? [];
    if (dbProds.length > 0) return dbProds;
    return REAL_PRODUCTS.filter(p => p.store_id === data.storeId) as any;
  });

export const getDashboardSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ storeId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const roleCheck = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const isAdmin = !!roleCheck.data;
    if (!isAdmin) {
      const store = await context.supabase
        .from("stores")
        .select("id")
        .eq("id", data.storeId)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (store.error || !store.data) throw new Error("لا تملك صلاحية عرض أقسام هذا المتجر");
    }
    const result = await context.supabase
      .from("store_sections")
      .select("id,store_id,name,sort_order,created_at")
      .eq("store_id", data.storeId)
      .order("sort_order")
      .order("name");
    if (result.error) throw new Error(result.error.message);
    const dbSecs = result.data ?? [];
    if (dbSecs.length > 0) return dbSecs;
    return REAL_SECTIONS.filter(s => s.store_id === data.storeId) as any;
  });

export const getDashboardOrderItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ orderId: z.string().uuid(), admin: z.boolean() }))
  .handler(async ({ context, data }) => {
    if (data.admin) {
      const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
      if (role.error || !role.data) throw new Error("هذه العملية مخصصة للإدارة فقط");
    }
    const order = await context.supabase.from("orders").select("store_id").eq("id", data.orderId).single();
    if (order.error || !order.data) throw new Error("الطلب غير موجود");
    if (!data.admin) {
      const store = await context.supabase
        .from("stores")
        .select("id")
        .eq("id", order.data.store_id)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (store.error || !store.data) throw new Error("لا تملك صلاحية عرض هذا الطلب");
    }
    const items = await context.supabase.from("order_items").select("name,qty,price").eq("order_id", data.orderId);
    if (items.error) throw new Error(items.error.message);
    return items.data ?? [];
  });

export const saveStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(storeInput)
  .handler(async ({ context, data }) => {
    const roleCheck = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const isAdmin = !!roleCheck.data;
    const { id, owner_email, ...values } = data;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let targetOwnerId: string | null = context.userId;

    if (isAdmin && owner_email !== undefined) {
      const trimmed = owner_email.trim().toLowerCase();
      if (trimmed === "") {
        targetOwnerId = null;
      } else {
        const usersRes = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const targetUser = (usersRes.data?.users ?? []).find(
          (u: any) => (u.email ?? "").toLowerCase() === trimmed
        );
        if (!targetUser) {
          throw new Error(`لم يتم العثور على أي حساب مسجل بالبريد: ${owner_email}`);
        }
        targetOwnerId = targetUser.id;
        const roleCheckTarget = await supabaseAdmin
          .from("user_roles")
          .select("id")
          .eq("user_id", targetUser.id)
          .eq("role", "provider")
          .maybeSingle();
        if (!roleCheckTarget.data) {
          await supabaseAdmin.from("user_roles").insert({
            user_id: targetUser.id,
            role: "provider",
          });
        }
      }
    }

    if (id) {
      let query = supabaseAdmin.from("stores").update(
        isAdmin && owner_email !== undefined ? { ...values, owner_id: targetOwnerId } : values
      ).eq("id", id);
      if (!isAdmin) {
        query = query.eq("owner_id", context.userId);
      }
      const result = await query.select("id").single();
      if (result.error) throw new Error(result.error.message);
      return result.data;
    } else {
      const result = await supabaseAdmin.from("stores").insert({
        ...values,
        owner_id: isAdmin ? targetOwnerId : context.userId,
      }).select("id").single();
      if (result.error) throw new Error(result.error.message);
      return result.data;
    }
  });

export const saveSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(sectionInput)
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const roleCheck = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const isAdmin = !!roleCheck.data;

    if (!isAdmin) {
      const store = await context.supabase
        .from("stores")
        .select("id")
        .eq("id", data.store_id)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (store.error || !store.data) throw new Error("لا تملك صلاحية تعديل أقسام هذا المتجر");
    }

    const dbClient = isAdmin ? supabaseAdmin : context.supabase;
    const { id, store_id, ...values } = data;
    const result = id
      ? await dbClient
          .from("store_sections")
          .update(values)
          .eq("id", id)
          .eq("store_id", store_id)
          .select("id")
          .single()
      : await dbClient
          .from("store_sections")
          .insert({ ...values, store_id })
          .select("id")
          .single();
    if (result.error) {
      if (result.error.code === "23505") throw new Error("هذا القسم موجود بالفعل");
      throw new Error(result.error.message);
    }
    return result.data;
  });

export const addSuggestedSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ store_id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const roleCheck = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const isAdmin = !!roleCheck.data;

    let storeCategory = "";
    if (isAdmin) {
      const s = await supabaseAdmin.from("stores").select("category").eq("id", data.store_id).maybeSingle();
      storeCategory = s.data?.category || "";
    } else {
      const store = await context.supabase
        .from("stores")
        .select("id,category")
        .eq("id", data.store_id)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (store.error || !store.data) throw new Error("لا تملك صلاحية تعديل أقسام هذا المتجر");
      storeCategory = store.data.category;
    }

    const suggestions = suggestedSectionsFor(storeCategory);
    if (!suggestions.length) throw new Error("لا توجد أقسام مقترحة لهذا النوع من المتاجر");
    const dbClient = isAdmin ? supabaseAdmin : context.supabase;
    const result = await dbClient.from("store_sections").upsert(
      suggestions.map((name, index) => ({ store_id: data.store_id, name, sort_order: (index + 1) * 10 })),
      { onConflict: "store_id,name", ignoreDuplicates: true },
    );
    if (result.error) throw new Error(result.error.message);
    return { success: true };
  });

export const deleteSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), store_id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const roleCheck = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const isAdmin = !!roleCheck.data;

    if (!isAdmin) {
      const store = await context.supabase
        .from("stores")
        .select("id")
        .eq("id", data.store_id)
        .eq("owner_id", context.userId)
        .maybeSingle();
      if (store.error || !store.data) throw new Error("لا تملك صلاحية حذف أقسام هذا المتجر");
    }

    const dbClient = isAdmin ? supabaseAdmin : context.supabase;
    // Unassign products from this section first so products remain safe
    await dbClient
      .from("products")
      .update({ section_id: null })
      .eq("section_id", data.id)
      .eq("store_id", data.store_id);

    const res = await dbClient
      .from("store_sections")
      .delete()
      .eq("id", data.id)
      .eq("store_id", data.store_id);

    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(productInput)
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const roleCheck = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const isAdmin = !!roleCheck.data;

    if (!isAdmin) {
      const store = await context.supabase
        .from("stores")
        .select("id")
        .eq("id", data.store_id)
        .eq("owner_id", context.userId)
        .single();
      if (store.error || !store.data) throw new Error("لا تملك صلاحية تعديل منتجات هذا المتجر");
    }

    const dbClient = isAdmin ? supabaseAdmin : context.supabase;
    const { id, ...values } = data;
    const result = id
      ? await dbClient
          .from("products")
          .update(values)
          .eq("id", id)
          .eq("store_id", data.store_id)
          .select("id")
          .single()
      : await dbClient.from("products").insert(values).select("id").single();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), store_id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const roleCheck = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const isAdmin = !!roleCheck.data;

    if (!isAdmin) {
      const store = await context.supabase
        .from("stores")
        .select("id")
        .eq("id", data.store_id)
        .eq("owner_id", context.userId)
        .single();
      if (store.error || !store.data) throw new Error("غير مسموح");
    }

    const dbClient = isAdmin ? supabaseAdmin : context.supabase;
    const result = await dbClient
      .from("products")
      .delete()
      .eq("id", data.id)
      .eq("store_id", data.store_id)
      .select("id")
      .single();
    if (result.error) throw new Error(result.error.message);
    return { success: true };
  });

export const approveStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(commissionInput)
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || !role.data) throw new Error("هذه العملية مخصصة للإدارة فقط");
    const result = await context.supabase
      .from("stores")
      .update({ commission_rate: data.commission_rate, is_active: data.is_active })
      .eq("id", data.id)
      .select("id")
      .single();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });

export const transferStoreOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(transferStoreOwnershipInput)
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || !role.data) throw new Error("هذه العملية مخصصة للإدارة فقط");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Case 1: Unassign ownership (make store public / unclaimed)
    if (data.unassign) {
      const existing = await supabaseAdmin.from("stores").select("id").eq("id", data.store_id).maybeSingle();
      if (existing.data) {
        const updateRes = await supabaseAdmin.from("stores").update({ owner_id: null }).eq("id", data.store_id);
        if (updateRes.error) throw new Error(updateRes.error.message);
      }
      return { success: true, store_id: data.store_id, owner_email: null, message: "تم إلغاء تعيين المالك" };
    }

    // Case 2: Assign ownership by email
    const trimmedEmail = (data.email ?? "").trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      throw new Error("يرجى إدخال بريد إلكتروني صحيح للمستخدم");
    }

    const usersRes = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const targetUser = (usersRes.data?.users ?? []).find(
      (u: any) => (u.email ?? "").toLowerCase() === trimmedEmail
    );

    if (!targetUser) {
      throw new Error(`لم يتم العثور على أي حساب مسجل بالبريد: ${trimmedEmail}. تأكد من تسجيل المستخدم في الموقع أولاً.`);
    }

    // Check if store exists in DB
    const existing = await supabaseAdmin.from("stores").select("id").eq("id", data.store_id).maybeSingle();

    if (!existing.data) {
      // Store is in curated REAL_STORES
      const staticStore = REAL_STORES.find(s => s.id === data.store_id);
      if (!staticStore) throw new Error("المتجر أو الخدمة المطلوبة غير موجودة");

      const insertStoreRes = await supabaseAdmin.from("stores").insert({
        id: staticStore.id,
        name: staticStore.name,
        category: staticStore.category,
        area_id: staticStore.area_id,
        description: staticStore.description,
        phone: staticStore.phone,
        address: staticStore.address,
        specialty: staticStore.specialty ?? null,
        delivery_fee: staticStore.delivery_fee,
        booking_fee: staticStore.booking_fee,
        commission_rate: staticStore.commission_rate,
        is_active: true,
        is_open: staticStore.is_open,
        logo_url: staticStore.logo_url,
        banner_url: staticStore.banner_url,
        owner_id: targetUser.id,
      });
      if (insertStoreRes.error) throw new Error(insertStoreRes.error.message);

      // Seed sections and products from static data so new owner can manage them
      const storeSections = REAL_SECTIONS.filter(sec => sec.store_id === staticStore.id);
      if (storeSections.length > 0) {
        await supabaseAdmin.from("store_sections").upsert(storeSections, { onConflict: "id", ignoreDuplicates: true });
      }
      const storeProducts = REAL_PRODUCTS.filter(p => p.store_id === staticStore.id);
      if (storeProducts.length > 0) {
        await supabaseAdmin.from("products").upsert(storeProducts, { onConflict: "id", ignoreDuplicates: true });
      }
    } else {
      // Update existing DB store
      const updateRes = await supabaseAdmin
        .from("stores")
        .update({ owner_id: targetUser.id, is_active: true })
        .eq("id", data.store_id);
      if (updateRes.error) throw new Error(updateRes.error.message);
    }

    // Ensure target user has 'provider' role in user_roles
    const roleCheckTarget = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", targetUser.id)
      .eq("role", "provider")
      .maybeSingle();

    if (!roleCheckTarget.data) {
      await supabaseAdmin.from("user_roles").insert({
        user_id: targetUser.id,
        role: "provider",
      });
    }

    return {
      success: true,
      store_id: data.store_id,
      owner_id: targetUser.id,
      owner_email: targetUser.email,
    };
  });

export const updateRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      kind: z.enum(requestKinds),
      id: z.string().uuid(),
      status: z.string(),
      quoted_price: z.number().min(0).optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    const existing = await context.supabase.from(data.kind).select("store_id,status").eq("id", data.id).single();
    if (existing.error || !existing.data) throw new Error("الطلب غير موجود");
    const [owner, admin] = await Promise.all([
      context.supabase.rpc("is_store_owner", { _store_id: existing.data.store_id }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    if ((!owner.data && !admin.data) || owner.error || admin.error) {
      throw new Error("لا تملك صلاحية إدارة هذا الطلب");
    }
    if (!allowedNext(data.kind, existing.data.status).includes(data.status)) {
      throw new Error("لا يمكن الانتقال إلى هذه الحالة");
    }
    if (data.kind === "service_requests" && data.status === "completed" && data.quoted_price === undefined) {
      throw new Error("أدخل السعر النهائي للخدمة");
    }
    const result =
      data.kind === "service_requests"
        ? await context.supabase
            .from("service_requests")
            .update({
              status: data.status,
              ...(data.quoted_price !== undefined ? { quoted_price: data.quoted_price } : {}),
            })
            .eq("id", data.id)
            .eq("status", existing.data.status)
            .select("id")
            .single()
        : data.kind === "orders"
          ? await context.supabase
              .from("orders")
              .update({
                status: data.status,
                ...(data.status === "on_the_way" ? { picked_up_at: new Date().toISOString() } : {}),
                ...(data.status === "delivered" ? { payment_status: "paid_cash" } : {}),
              })
              .eq("id", data.id)
              .eq("status", existing.data.status)
              .select("id")
              .single()
          : await context.supabase
              .from("bookings")
              .update({ status: data.status })
              .eq("id", data.id)
              .eq("status", existing.data.status)
              .select("id")
              .single();
    if (result.error) throw new Error(result.error.message);

    if (data.kind === "orders") {
      try {
        const { notifyOrderStatusUpdate } = await import("@/lib/chat.functions");
        await notifyOrderStatusUpdate(data.id, data.status);
      } catch (e) {
        console.error("notifyOrderStatusUpdate failed:", e);
      }
    }

    return result.data;
  });

export const importCatalogProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(catalogImportInput)
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const roleCheck = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const isAdmin = !!roleCheck.data;

    let storeCategory = "";
    if (isAdmin) {
      const s = await supabaseAdmin.from("stores").select("category").eq("id", data.store_id).maybeSingle();
      storeCategory = s.data?.category || "";
    } else {
      const store = await context.supabase
        .from("stores")
        .select("id,category")
        .eq("id", data.store_id)
        .eq("owner_id", context.userId)
        .single();
      if (store.error || !store.data) throw new Error("لا تملك صلاحية تعديل منتجات هذا المتجر");
      storeCategory = store.data.category;
    }

    if (storeCategory !== "supermarkets") throw new Error("الكتالوج الجاهز متاح لمتاجر السوبر ماركت فقط");

    const dbClient = isAdmin ? supabaseAdmin : context.supabase;

    const items = data.items.map(input => {
      const item = catalogItem(input.key);
      if (!item) throw new Error("منتج غير موجود في الكتالوج");
      return { input, item };
    });
    const usedGroups = CATALOG_GROUPS.filter(group => items.some(({ item }) => item.group === group.key));
    const sectionSetup = await dbClient.from("store_sections").upsert(
      usedGroups.map((group, index) => ({
        store_id: data.store_id,
        name: group.name,
        sort_order: (CATALOG_GROUPS.indexOf(group) + 1) * 10 + index * 0,
      })),
      { onConflict: "store_id,name", ignoreDuplicates: true },
    );
    if (sectionSetup.error) throw new Error(sectionSetup.error.message);
    const sections = await dbClient
      .from("store_sections")
      .select("id,name")
      .eq("store_id", data.store_id);
    if (sections.error) throw new Error(sections.error.message);

    const rows = items.map(({ input, item }) => {
      const group = CATALOG_GROUPS.find(candidate => candidate.key === item.group);
      return {
        store_id: data.store_id,
        catalog_key: item.key,
        name: item.name,
        description: item.size,
        image_url: catalogImage(item.group),
        section_id: sections.data.find(section => section.name === group?.name)?.id ?? null,
        price: input.price,
        stock_qty: input.stock_qty,
        is_available: input.stock_qty !== 0,
      };
    });
    const result = await dbClient
      .from("products")
      .upsert(rows, { onConflict: "store_id,catalog_key" })
      .select("id");
    if (result.error) throw new Error(result.error.message);
    return { count: result.data?.length ?? 0 };
  });

export const sendBroadcastNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      title: z.string().trim().min(3, "عنوان الإشعار يجب أن لا يقل عن 3 أحرف").max(100),
      body: z.string().trim().min(5, "نص الإشعار يجب أن لا يقل عن 5 أحرف").max(500),
      target: z.string(),
      path: z.string().optional(),
    })
  )
  .handler(async ({ context, data }) => {
    const roleCheck = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleCheck.error || !roleCheck.data) {
      throw new Error("هذه العملية متاحة للإدارة فقط");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let targetUserIds: string[] = [];

    if (data.target === "all") {
      try {
        const usersRes = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        targetUserIds = (usersRes.data?.users ?? []).map((u) => u.id);
      } catch (err) {
        console.error("Failed to list auth users, falling back to profiles/roles:", err);
        const [profRes, rolesRes] = await Promise.all([
          supabaseAdmin.from("profiles").select("id"),
          supabaseAdmin.from("user_roles").select("user_id"),
        ]);
        const ids = new Set<string>();
        (profRes.data ?? []).forEach((p: any) => ids.add(p.id));
        (rolesRes.data ?? []).forEach((r: any) => ids.add(r.user_id));
        targetUserIds = Array.from(ids);
      }
    } else if (data.target === "stores_all") {
      const storesRes = await supabaseAdmin.from("stores").select("owner_id").not("owner_id", "is", null);
      targetUserIds = Array.from(new Set((storesRes.data ?? []).map((s: any) => s.owner_id).filter(Boolean)));
    } else if (data.target.startsWith("category:")) {
      const cat = data.target.replace("category:", "");
      const storesRes = await supabaseAdmin.from("stores").select("owner_id").eq("category", cat).not("owner_id", "is", null);
      targetUserIds = Array.from(new Set((storesRes.data ?? []).map((s: any) => s.owner_id).filter(Boolean)));
    } else if (data.target === "drivers") {
      const driversRes = await supabaseAdmin.from("drivers").select("user_id").not("user_id", "is", null);
      targetUserIds = Array.from(new Set((driversRes.data ?? []).map((d: any) => d.user_id).filter(Boolean)));
    }

    if (targetUserIds.length === 0) {
      return { success: true, count: 0, message: "لم يتم العثور على مستخدمين مسجلين في هذه الفئة حالياً" };
    }

    // 1. إدراج الإشعارات في قاعدة البيانات للمستخدمين
    const now = new Date().toISOString();
    const rows = targetUserIds.map((uid) => ({
      user_id: uid,
      title: data.title,
      body: data.body,
      is_read: false,
      created_at: now,
    }));

    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const insertRes = await supabaseAdmin.from("notifications").insert(chunk);
      if (insertRes.error) {
        console.error("Batch insert notification error:", insertRes.error);
      }
    }

    // 2. إرسال Push Notifications للهواتف المفعلة
    try {
      const { sendPushToUser } = await import("@/lib/push.functions");
      Promise.allSettled(
        targetUserIds.map((uid) =>
          sendPushToUser(uid, {
            title: data.title,
            body: data.body,
            path: data.path || "/",
            tag: "broadcast-admin",
          })
        )
      ).catch((e) => console.error("Broadcast push error:", e));
    } catch (pushErr) {
      console.warn("Could not import or trigger push notifications:", pushErr);
    }

    return {
      success: true,
      count: targetUserIds.length,
      message: `تم إرسال الإشعار بنجاح إلى ${targetUserIds.length} مستخدم`,
    };
  });

export const getBroadcastAudienceCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ target: z.string() }))
  .handler(async ({ context, data }) => {
    const roleCheck = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleCheck.error || !roleCheck.data) {
      throw new Error("هذه العملية متاحة للإدارة فقط");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let count = 0;
    if (data.target === "all") {
      try {
        const usersRes = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        count = usersRes.data?.users?.length ?? 0;
      } catch {
        const profRes = await supabaseAdmin.from("profiles").select("id", { count: "exact", head: true });
        count = profRes.count ?? 0;
      }
    } else if (data.target === "stores_all") {
      const storesRes = await supabaseAdmin.from("stores").select("owner_id").not("owner_id", "is", null);
      const unique = new Set((storesRes.data ?? []).map((s: any) => s.owner_id).filter(Boolean));
      count = unique.size;
    } else if (data.target.startsWith("category:")) {
      const cat = data.target.replace("category:", "");
      const storesRes = await supabaseAdmin.from("stores").select("owner_id").eq("category", cat).not("owner_id", "is", null);
      const unique = new Set((storesRes.data ?? []).map((s: any) => s.owner_id).filter(Boolean));
      count = unique.size;
    } else if (data.target === "drivers") {
      const driversRes = await supabaseAdmin.from("drivers").select("user_id").not("user_id", "is", null);
      const unique = new Set((driversRes.data ?? []).map((d: any) => d.user_id).filter(Boolean));
      count = unique.size;
    }

    return { count };
  });

export const deleteStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(deleteStoreInput)
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || !role.data) throw new Error("هذه العملية مخصصة للإدارة فقط");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Try stored procedure admin_delete_store
    const rpcRes = await context.supabase.rpc("admin_delete_store", { _store_id: data.storeId });
    if (!rpcRes.error) {
      return { success: true };
    }

    // 2. Cascade delete fallback via supabaseAdmin
    try {
      await supabaseAdmin.from("store_deletion_requests" as any).delete().eq("store_id", data.storeId);
      
      const ordersRes = await supabaseAdmin.from("orders").select("id").eq("store_id", data.storeId);
      const orderIds = (ordersRes.data ?? []).map((o: any) => o.id);
      if (orderIds.length > 0) {
        await supabaseAdmin.from("order_messages" as any).delete().in("order_id", orderIds);
        await supabaseAdmin.from("order_items").delete().in("order_id", orderIds);
        await supabaseAdmin.from("orders").delete().eq("store_id", data.storeId);
      }
      await supabaseAdmin.from("bookings").delete().eq("store_id", data.storeId);
      await supabaseAdmin.from("service_requests").delete().eq("store_id", data.storeId);
      await supabaseAdmin.from("reviews").delete().eq("store_id", data.storeId);
      await supabaseAdmin.from("products").delete().eq("store_id", data.storeId);
      await supabaseAdmin.from("store_sections").delete().eq("store_id", data.storeId);

      const delStore = await supabaseAdmin.from("stores").delete().eq("id", data.storeId);
      if (delStore.error) throw new Error(delStore.error.message);
      return { success: true };
    } catch (err) {
      console.error("Error during deleteStore cascade fallback:", err);
      throw new Error(err instanceof Error ? err.message : "فشل حذف المتجر");
    }
  });

export const toggleStoreVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(storeVisibilityInput)
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || !role.data) throw new Error("هذه العملية مخصصة للإدارة فقط");

    const result = await context.supabase
      .from("stores")
      .update({ is_active: data.is_active })
      .eq("id", data.storeId)
      .select("id, is_active")
      .single();

    if (result.error) throw new Error(result.error.message);
    return { success: true, is_active: result.data.is_active };
  });

export const requestStoreDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(storeDeletionRequestInput)
  .handler(async ({ context, data }) => {
    const store = await context.supabase
      .from("stores")
      .select("id, name, owner_id")
      .eq("id", data.storeId)
      .maybeSingle();

    if (!store.data) throw new Error("المتجر غير موجود");

    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const isAdmin = !!role.data;

    if (!isAdmin && store.data.owner_id !== context.userId) {
      throw new Error("غير مصرح لك بطلب حذف هذا المتجر");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check if there is already a pending request
    const existing = await supabaseAdmin
      .from("store_deletion_requests" as any)
      .select("id")
      .eq("store_id", data.storeId)
      .eq("status", "pending")
      .maybeSingle();

    if (existing.data) {
      throw new Error("يوجد بالفعل طلب حذف قيد المراجعة لهذا المتجر");
    }

    const insertRes = await supabaseAdmin
      .from("store_deletion_requests" as any)
      .insert({
        store_id: data.storeId,
        owner_id: context.userId,
        store_name: store.data.name,
        reason: data.reason,
        status: "pending",
      });

    if (insertRes.error) throw new Error(insertRes.error.message);

    return { success: true };
  });

export const cancelStoreDeletionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(cancelStoreDeletionRequestInput)
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const req = await supabaseAdmin
      .from("store_deletion_requests" as any)
      .select("id, owner_id, status")
      .eq("id", data.requestId)
      .maybeSingle();

    if (!req.data) throw new Error("طلب الحذف غير موجود");

    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    const isAdmin = !!role.data;

    if (!isAdmin && req.data.owner_id !== context.userId) {
      throw new Error("غير مصرح لك بإلغاء هذا الطلب");
    }

    const delRes = await supabaseAdmin
      .from("store_deletion_requests" as any)
      .delete()
      .eq("id", data.requestId);

    if (delRes.error) throw new Error(delRes.error.message);
    return { success: true };
  });

export const reviewStoreDeletionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(reviewStoreDeletionRequestInput)
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.error || !role.data) throw new Error("هذه العملية مخصصة للإدارة فقط");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const reqRes = await supabaseAdmin
      .from("store_deletion_requests" as any)
      .select("id, store_id, owner_id, store_name, status")
      .eq("id", data.requestId)
      .maybeSingle();

    if (!reqRes.data) throw new Error("طلب الحذف غير موجود");
    const req = reqRes.data;

    if (data.action === "approve") {
      // 1. Mark request as approved
      await supabaseAdmin
        .from("store_deletion_requests" as any)
        .update({
          status: "approved",
          admin_notes: data.admin_notes ?? "تمت الموافقة على الحذف من قبل الإدارة",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", data.requestId);

      // 2. Delete the store
      const rpcRes = await context.supabase.rpc("admin_delete_store", { _store_id: req.store_id });
      if (rpcRes.error) {
        // Fallback cascade delete
        const ordersRes = await supabaseAdmin.from("orders").select("id").eq("store_id", req.store_id);
        const orderIds = (ordersRes.data ?? []).map((o: any) => o.id);
        if (orderIds.length > 0) {
          await supabaseAdmin.from("order_messages" as any).delete().in("order_id", orderIds);
          await supabaseAdmin.from("order_items").delete().in("order_id", orderIds);
          await supabaseAdmin.from("orders").delete().eq("store_id", req.store_id);
        }
        await supabaseAdmin.from("bookings").delete().eq("store_id", req.store_id);
        await supabaseAdmin.from("service_requests").delete().eq("store_id", req.store_id);
        await supabaseAdmin.from("reviews").delete().eq("store_id", req.store_id);
        await supabaseAdmin.from("products").delete().eq("store_id", req.store_id);
        await supabaseAdmin.from("store_sections").delete().eq("store_id", req.store_id);
        await supabaseAdmin.from("stores").delete().eq("id", req.store_id);
      }

      // 3. Notify owner
      await supabaseAdmin.from("notifications").insert({
        user_id: req.owner_id,
        title: "تمت الموافقة على حذف المتجر ✅",
        body: `تمت الموافقة على طلب حذف متجر «${req.store_name}» وتم حذفه وإزالته من التطبيق نهائياً.`,
        is_read: false,
      });

      return { success: true, approved: true };
    } else {
      // Reject
      await supabaseAdmin
        .from("store_deletion_requests" as any)
        .update({
          status: "rejected",
          admin_notes: data.admin_notes ?? "تم رفض طلب الحذف من قبل الإدارة",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", data.requestId);

      // Notify owner
      await supabaseAdmin.from("notifications").insert({
        user_id: req.owner_id,
        title: "تم رفض طلب حذف المتجر ❌",
        body: `تم رفض طلب حذف متجر «${req.store_name}». ${data.admin_notes ? "ملاحظة الإدارة: " + data.admin_notes : ""}`,
        is_read: false,
      });

      return { success: true, approved: false };
    }
  });

