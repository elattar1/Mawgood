import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { bookingInput, checkoutInput, serviceInput, canCustomerCancel } from './customer-rules';
import { formatOrderPushPayload } from './push-rules';
import { requestKinds } from './dashboard-rules';
import { TIME_SLOTS } from './labels';

export const placeCustomerOrder = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(checkoutInput)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { REAL_STORES, REAL_SECTIONS, REAL_PRODUCTS } = await import('./real-stores-data');

    // 1. Ensure store exists in DB (auto-seed if it's a curated store)
    let store = await context.supabase
      .from('stores')
      .select('id,name,owner_id,is_active,is_open,category,delivery_fee,commission_rate')
      .eq('id', data.store_id)
      .maybeSingle();

    if (!store.data) {
      throw new Error('المتجر غير متاح أو تم حذفه');
    }

    if (!store.data?.is_active || !store.data.is_open || ['doctors', 'maintenance', 'home'].includes(store.data.category)) {
      throw new Error('المتجر غير متاح للطلب الآن');
    }

    // التحقق من وجود دليفري شغال في الوقت الحالي
    const activeDrivers = await supabaseAdmin
      .from('drivers')
      .select('user_id', { count: 'exact', head: true })
      .eq('is_active', true);

    if (!activeDrivers.count || activeDrivers.count === 0) {
      throw new Error('لا يوجد توصيل في الوقت الحالي، جميع كباتن التوصيل غير متاحين الآن');
    }

    // 2. Normalize and resolve item product IDs (supports both legacy 35-char and new 36-char IDs)
    const storeSuffix = data.store_id.replace(/^.*-(\d{3,4})$/, '$1').padStart(4, '0');
    const resolvedItems = data.items.map(item => {
      let pid = item.product_id;
      const legacyMatch = pid.match(/^20000000-0000-0000-0000-0{9,11}(\d+)$/);
      if (legacyMatch) {
        const prodNum = String(Number(legacyMatch[1])).padStart(12, '0');
        pid = `40000000-0000-0000-${storeSuffix}-${prodNum}`;
      }
      return { ...item, product_id: pid };
    });

    // 3. Ensure sections and products exist in DB for this store so Postgres foreign keys and checks pass
    const resolvedIds = resolvedItems.map(i => i.product_id);
    const dbProducts = await context.supabase
      .from('products')
      .select('id,is_available,price')
      .eq('store_id', data.store_id)
      .in('id', resolvedIds);

    const existingIds = new Set((dbProducts.data ?? []).map((p: any) => p.id));
    const missing = resolvedItems.filter(i => !existingIds.has(i.product_id));

    if (missing.length > 0) {
      // Seed sections first to satisfy foreign key constraints
      const staticSections = REAL_SECTIONS.filter(sec => sec.store_id === data.store_id);
      if (staticSections.length > 0) {
        await supabaseAdmin.from('store_sections').upsert(staticSections, { onConflict: 'id', ignoreDuplicates: true });
      }

      // Seed products from REAL_PRODUCTS
      const staticStoreProds = REAL_PRODUCTS.filter(p => p.store_id === data.store_id);
      if (staticStoreProds.length > 0) {
        await supabaseAdmin.from('products').upsert(
          staticStoreProds.map(p => ({
            id: p.id,
            store_id: p.store_id,
            section_id: p.section_id,
            name: p.name,
            description: p.description,
            price: p.price,
            is_available: p.is_available,
            image_url: p.image_url,
          })),
          { onConflict: 'id', ignoreDuplicates: true },
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
    const result = await context.supabase.rpc('place_order', args as typeof args & { _area_id: number });
    if (result.error || !result.data) {
      console.error('place_order error:', result.error);
      throw new Error('تعذر إرسال الطلب؛ تحقق من توفر المنتجات وحاول مرة أخرى');
    }

    const orderId = String(result.data);
    const shortId = orderId.slice(0, 8);
    const totalItemsCount = resolvedItems.reduce((acc, it) => acc + (it.quantity || 1), 0);

    // Fetch store record via admin client to ensure owner_id is never restricted by RLS
    const dbStore = await supabaseAdmin
      .from('stores')
      .select('id, name, owner_id')
      .eq('id', data.store_id)
      .maybeSingle();

    const storeName = dbStore.data?.name || store.data.name || 'المتجر';
    const storeOwnerId = dbStore.data?.owner_id || store.data.owner_id;

    // 5. Send real-time in-app notification & Web Push to store owner (or admins)
    try {
      const { sendNotificationWithPush } = await import('@/lib/push.functions');
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
        const adminRoles = await supabaseAdmin.from('user_roles').select('user_id').eq('role', 'admin');
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

      // Customer in-app and push order confirmation
      await sendNotificationWithPush({
        userId: context.userId,
        title: `🛍️ تم تأكيد إرسال طلبك إلى ${storeName}`,
        body: `طلبك رقم #${shortId} قيد المراجعة لدى المتجر. سنوافيك بإشعار فور بدء التحضير.`,
        path: `/orders?filter=active&chat=${orderId}`,
        tag: `husayniya-order-cust-${orderId}`,
      });
    } catch (notifErr) {
      console.error('Failed to dispatch order notification/push:', notifErr);
    }

    return { id: result.data };
  });

export const createBooking = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(bookingInput)
  .handler(async ({ data, context }) => {
    const store = await context.supabase.from('stores').select('id,name,owner_id,category,is_active,is_open').eq('id', data.store_id).single();
    if (!store.data?.is_active || !store.data.is_open || store.data.category !== 'doctors') throw new Error('الطبيب غير متاح للحجز');
    if (!TIME_SLOTS.includes(data.booking_time)) throw new Error('اختر موعدًا صحيحًا');
    const result = await context.supabase.from('bookings').insert({ ...data, customer_id: context.userId }).select('id').single();
    if (result.error) throw new Error('تعذر الحجز؛ تأكد من التاريخ وحاول مرة أخرى');

    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const { sendNotificationWithPush } = await import('@/lib/push.functions');
      const dbStore = await supabaseAdmin.from('stores').select('id, name, owner_id').eq('id', data.store_id).maybeSingle();
      const ownerId = dbStore.data?.owner_id || store.data?.owner_id;
      if (ownerId) {
        const docTitle = `🩺 حجز موعد جديد (${dbStore.data?.name || store.data.name || 'العيادة'})`;
        const docBody = `حجز جديد بتاريخ ${data.booking_date} الساعة ${data.booking_time} باسم المريض: ${data.patient_name} (${data.phone})`;
        await sendNotificationWithPush({
          userId: ownerId,
          title: docTitle,
          body: docBody,
          path: '/provider?tab=bookings',
          tag: `husayniya-booking-${result.data.id}`,
        });
      }
    } catch (err) {
      console.error('Failed to dispatch booking push:', err);
    }

    return result.data;
  });

export const createServiceRequest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(serviceInput)
  .handler(async ({ data, context }) => {
    const store = await context.supabase.from('stores').select('id,name,owner_id,category,is_active,is_open').eq('id', data.store_id).single();
    if (!store.data?.is_active || !store.data.is_open || !['maintenance', 'home'].includes(store.data.category)) throw new Error('مقدم الخدمة غير متاح');
    if (data.image_paths.some(p => !p.startsWith(`${context.userId}/`) || p.includes('..'))) throw new Error('صور غير صالحة');
    const result = await context.supabase.from('service_requests').insert({
      store_id: data.store_id,
      description: data.description + (data.notes ? `\n${data.notes}` : ''),
      address: data.address,
      phone: data.phone,
      area_id: data.area_id,
      preferred_date: data.preferred_date,
      image_paths: data.image_paths,
      customer_id: context.userId,
    }).select('id').single();
    if (result.error) throw new Error('تعذر إرسال طلب الخدمة');

    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const { sendNotificationWithPush } = await import('@/lib/push.functions');
      const dbStore = await supabaseAdmin.from('stores').select('id, name, owner_id').eq('id', data.store_id).maybeSingle();
      const ownerId = dbStore.data?.owner_id || store.data?.owner_id;
      if (ownerId) {
        const srvTitle = `🔧 طلب صيانة جديد (${dbStore.data?.name || store.data.name || 'مقدم الخدمة'})`;
        const srvBody = `طلب جديد من ${data.phone} - العنوان: ${data.address}`;
        await sendNotificationWithPush({
          userId: ownerId,
          title: srvTitle,
          body: srvBody,
          path: '/provider?tab=services',
          tag: `husayniya-service-${result.data.id}`,
        });
      }
    } catch (err) {
      console.error('Failed to dispatch service push:', err);
    }

    return result.data;
  });

export const getCustomerOrders = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const [orders, bookings, services] = await Promise.all([
      db.from('orders').select('*,order_items(*)').eq('customer_id', context.userId).order('created_at', { ascending: false }),
      db.from('bookings').select('*').eq('customer_id', context.userId).order('created_at', { ascending: false }),
      db.from('service_requests').select('*').eq('customer_id', context.userId).order('created_at', { ascending: false }),
    ]);
    for (const result of [orders, bookings, services]) {
      if (result.error) throw new Error('تعذر تحميل طلباتك');
    }
    return { orders: orders.data ?? [], bookings: bookings.data ?? [], services: services.data ?? [] };
  });

export const cancelCustomerRequest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ kind: z.enum(requestKinds), id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const row = await context.supabase.from(data.kind).select('status').eq('id', data.id).eq('customer_id', context.userId).single();
    if (!row.data || !canCustomerCancel(data.kind, row.data.status)) throw new Error('لا يمكن إلغاء الطلب في حالته الحالية');
    const result = await context.supabase.from(data.kind).update({ status: 'cancelled' }).eq('id', data.id).eq('customer_id', context.userId).eq('status', row.data.status).select('id').single();
    if (result.error) throw new Error('تعذر الإلغاء؛ حدّث الطلب وحاول مرة أخرى');

    if (data.kind === "orders") {
      try {
        const { notifyOrderStatusUpdate } = await import("@/lib/chat.functions");
        await notifyOrderStatusUpdate(data.id, "cancelled");
      } catch (e) {
        console.error("cancel notification error:", e);
      }
    }

    return result.data;
  });

export const getNotifications = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await context.supabase.from('notifications').select('*').eq('user_id', context.userId).order('created_at', { ascending: false }).limit(100);
    if (result.error) throw new Error('تعذر تحميل الإشعارات');
    return result.data ?? [];
  });

export const readNotification = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid().optional() }))
  .handler(async ({ data, context }) => {
    let query = context.supabase.from('notifications').update({ is_read: true }).eq('user_id', context.userId);
    if (data.id) query = query.eq('id', data.id);
    const result = await query;
    if (result.error) throw new Error('تعذر تحديث الإشعارات');
    return { success: true };
  });

export const getDeliveryAvailability = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { count } = await supabaseAdmin
      .from('drivers')
      .select('user_id', { count: 'exact', head: true })
      .eq('is_active', true);
    return { available: (count ?? 0) > 0, count: count ?? 0 };
  });

export const submitOrderReview = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      orderId: z.string().uuid(),
      storeId: z.string().uuid(),
      storeRating: z.number().min(1).max(5),
      storeComment: z.string().trim().max(500).optional(),
      driverRating: z.number().min(1).max(5).optional(),
      driverComment: z.string().trim().max(500).optional(),
    })
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const orderRes = await supabaseAdmin
      .from('orders')
      .select('id, customer_id, driver_id, store_id, status, stores(name)')
      .eq('id', data.orderId)
      .eq('customer_id', context.userId)
      .maybeSingle();

    if (!orderRes.data) {
      throw new Error('لم يتم العثور على الطلب');
    }

    // 1. التحقق الصارم من أن الطلب مسجل للمتجر المطلوب تقييمه منعاً للتزوير
    if (orderRes.data.store_id !== data.storeId) {
      throw new Error('الطلب المحدد غير مسجل لهذا المتجر');
    }

    // 2. التحقق من أن الطلب تم تسليمه واكتماله بالفعل قبل السماح بالتقييم
    if (orderRes.data.status !== 'delivered' && orderRes.data.status !== 'completed') {
      throw new Error('لا يمكن تقييم المتجر إلا بعد تسليم واستلام الطلب بنجاح');
    }

    // 3. منع التقييمات المكررة لنفس المتجر خلال 24 ساعة
    const recentReview = await supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('store_id', data.storeId)
      .eq('user_id', context.userId)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle();

    if (recentReview.data) {
      throw new Error('لقد قمت بإرسال تقييم لهذا المتجر مؤخراً، شكراً لمشاركتك رأيك');
    }

    const profile = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', context.userId)
      .maybeSingle();
    const authorName = profile.data?.full_name || 'عميل';

    await supabaseAdmin.from('reviews').insert({
      store_id: data.storeId,
      user_id: context.userId,
      author_name: authorName,
      rating: data.storeRating,
      comment: data.storeComment || 'تقييم جودة الخدمة والمنتجات',
    });

    if (data.driverRating && orderRes.data.driver_id) {
      try {
        const { sendNotificationWithPush } = await import('@/lib/push.functions');
        await sendNotificationWithPush({
          userId: orderRes.data.driver_id,
          title: `⭐ تقييم جديد لخدمة التوصيل (${data.driverRating}/5)`,
          body: data.driverComment || 'قيّم العميل خدمة التوصيل بنجاح. شكراً لجهودك!',
          path: '/delivery?tab=wallet',
          tag: `husayniya-driver-rate-${data.orderId}`,
        });
      } catch (err) {
        console.error('Driver review notification error:', err);
      }
    }

    return { success: true };
  });

export const submitCustomerComplaint = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      type: z.enum(['complaint', 'suggestion', 'inquiry']).default('complaint'),
      title: z.string().trim().min(1),
      description: z.string().trim().min(1),
      customerName: z.string().trim().optional(),
      phone: z.string().trim().optional(),
      imageUrl: z.string().nullable().optional(),
    })
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // 1. Try inserting directly into complaints_suggestions if table exists
    let complaintSaved = false;
    try {
      const res = await supabaseAdmin.from('complaints_suggestions' as any).insert({
        user_id: context.userId,
        customer_name: data.customerName || 'عميل',
        phone: data.phone || '',
        type: data.type,
        title: data.title,
        description: data.description,
        image_url: data.imageUrl,
        status: 'pending',
      } as any);
      if (!res.error) {
        complaintSaved = true;
      } else {
        console.warn('complaints_suggestions insert returned error, using fallback:', res.error);
      }
    } catch (e) {
      console.warn('complaints_suggestions table not present, using fallback:', e);
    }

    const { sendNotificationWithPush } = await import('@/lib/push.functions');
    const typeLabel = data.type === 'complaint' ? 'شكوى' : data.type === 'suggestion' ? 'اقتراح' : 'استفسار';
    const payload = JSON.stringify({
      id: crypto.randomUUID(),
      ticket_type: data.type,
      user_id: context.userId,
      customer_name: data.customerName || 'عميل',
      phone: data.phone || '',
      title: data.title,
      description: data.description,
      image_url: data.imageUrl,
      created_at: new Date().toISOString(),
    });

    const adminRoles = await supabaseAdmin.from('user_roles').select('user_id').eq('role', 'admin');
    if (adminRoles.data && adminRoles.data.length > 0) {
      for (const admin of adminRoles.data) {
        await sendNotificationWithPush({
          userId: admin.user_id,
          title: `📩 [${typeLabel} جديدة]: ${data.title}`,
          body: `من: ${data.customerName || 'عميل'} | هاتف: ${data.phone || 'غير مسجل'}\n${data.description}${complaintSaved ? '' : `\n[TICKET_PAYLOAD:${payload}]`}`,
          path: '/admin',
          tag: `husayniya-ticket-${Date.now()}`,
        });
      }
    }

    // Confirmation to customer
    await sendNotificationWithPush({
      userId: context.userId,
      title: 'تم استلام رسالتك بنجاح',
      body: `تم استلام ${typeLabel} بعنوان "${data.title}". سيقوم فريق الإدارة بمراجعتها والتواصل معك قريباً.`,
      path: '/account',
      tag: `husayniya-ticket-cust-${Date.now()}`,
    });

    return { success: true };
  });

export const submitDriverApplication = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      fullName: z.string().trim().min(1),
      phone: z.string().trim().min(8),
      vehicleType: z.string().trim(),
      nationalId: z.string().trim().optional(),
    })
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // 1. Try inserting directly into driver_applications if table exists
    let driverSaved = false;
    try {
      const res = await supabaseAdmin.from('driver_applications' as any).insert({
        user_id: context.userId,
        full_name: data.fullName,
        phone: data.phone,
        vehicle_type: data.vehicleType,
        national_id: data.nationalId || null,
        status: 'pending',
      } as any);
      if (!res.error) {
        driverSaved = true;
      } else {
        console.warn('driver_applications insert returned error, using fallback:', res.error);
      }
    } catch (e) {
      console.warn('driver_applications table not present, using fallback:', e);
    }

    const { sendNotificationWithPush } = await import('@/lib/push.functions');
    const payload = JSON.stringify({
      id: crypto.randomUUID(),
      application_type: 'driver',
      user_id: context.userId,
      full_name: data.fullName,
      phone: data.phone,
      vehicle_type: data.vehicleType,
      national_id: data.nationalId || '',
      created_at: new Date().toISOString(),
    });

    const adminRoles = await supabaseAdmin.from('user_roles').select('user_id').eq('role', 'admin');
    if (adminRoles.data && adminRoles.data.length > 0) {
      for (const admin of adminRoles.data) {
        await sendNotificationWithPush({
          userId: admin.user_id,
          title: `🛵 [طلب انضمام دليفري جديد]: ${data.fullName}`,
          body: `الاسم: ${data.fullName}\nالهاتف: ${data.phone}\nوسيلة التوصيل: ${data.vehicleType}${data.nationalId ? `\nالرقم القومي: ${data.nationalId}` : ''}${driverSaved ? '' : `\n[APPLICATION_PAYLOAD:${payload}]`}`,
          path: '/drivers',
          tag: `husayniya-driver-app-${Date.now()}`,
        });
      }
    }

    // Confirmation to customer
    await sendNotificationWithPush({
      userId: context.userId,
      title: 'تم استلام طلب الانضمام لأسطول التوصيل',
      body: `شكراً لك يا ${data.fullName}! تم استلام طلبك للعمل كمندوب توصيل (${data.vehicleType}) بنجاح وسنتواصل معك هاتفياً قريباً.`,
      path: '/account',
      tag: `husayniya-driver-app-cust-${Date.now()}`,
    });

    return { success: true };
  });

export const submitMerchantApplication = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      storeName: z.string().trim().min(1),
      category: z.string().trim(),
      address: z.string().trim().min(1),
      phone: z.string().trim().min(8),
      description: z.string().trim().min(1),
    })
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // 1. Try inserting directly into merchant_applications if table exists
    let merchantSaved = false;
    try {
      const res = await supabaseAdmin.from('merchant_applications' as any).insert({
        user_id: context.userId,
        store_name: data.storeName,
        category: data.category,
        address: data.address,
        phone: data.phone,
        description: data.description,
        status: 'pending',
      } as any);
      if (!res.error) {
        merchantSaved = true;
      } else {
        console.warn('merchant_applications insert returned error, using fallback:', res.error);
      }
    } catch (e) {
      console.warn('merchant_applications table not present, using fallback:', e);
    }

    const { sendNotificationWithPush } = await import('@/lib/push.functions');
    const payload = JSON.stringify({
      id: crypto.randomUUID(),
      application_type: 'merchant',
      user_id: context.userId,
      store_name: data.storeName,
      category: data.category,
      address: data.address,
      phone: data.phone,
      description: data.description,
      created_at: new Date().toISOString(),
    });

    const adminRoles = await supabaseAdmin.from('user_roles').select('user_id').eq('role', 'admin');
    if (adminRoles.data && adminRoles.data.length > 0) {
      for (const admin of adminRoles.data) {
        await sendNotificationWithPush({
          userId: admin.user_id,
          title: `🏪 [طلب إضافة متجر جديد]: ${data.storeName}`,
          body: `اسم النشاط: ${data.storeName}\nالقسم: ${data.category}\nالعنوان: ${data.address}\nالهاتف: ${data.phone}\nالتفاصيل: ${data.description}${merchantSaved ? '' : `\n[APPLICATION_PAYLOAD:${payload}]`}`,
          path: '/admin?tab=stores',
          tag: `husayniya-merchant-app-${Date.now()}`,
        });
      }
    }

    // Confirmation to customer
    await sendNotificationWithPush({
      userId: context.userId,
      title: 'تم استلام طلب إضافة نشاطك التجاري',
      body: `تم تسجيل طلب إضافة "${data.storeName}" بنجاح! سيقوم فريق إدارة خدمات الحسينية بمراجعته والتواصل معك لتفعيله.`,
      path: '/account',
      tag: `husayniya-merchant-app-cust-${Date.now()}`,
    });

    return { success: true };
  });

export const getCustomerComplaintsList = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // 1. Try complaints_suggestions table
    try {
      const res = await supabaseAdmin
        .from('complaints_suggestions' as any)
        .select('*')
        .eq('user_id', context.userId)
        .order('created_at', { ascending: false });
      if (!res.error && res.data && res.data.length > 0) {
        return res.data;
      }
    } catch {}

    // 2. Fallback: read notifications for user
    try {
      const notifs = await supabaseAdmin
        .from('notifications')
        .select('*')
        .eq('user_id', context.userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (notifs.data) {
        const tickets: any[] = [];
        for (const n of notifs.data) {
          if (n.title.includes('استلام رسالتك') || n.title.includes('استلام طلب')) {
            tickets.push({
              id: n.id,
              user_id: context.userId,
              customer_name: 'أنت',
              phone: '',
              type: n.title.includes('دليفري') ? 'suggestion' : 'complaint',
              title: n.title,
              description: n.body,
              image_url: null,
              status: 'pending',
              admin_reply: null,
              replied_at: null,
              created_at: n.created_at,
            });
          }
        }
        return tickets;
      }
    } catch {}

    return [];
  });

export const getAdminComplaintsTickets = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (role.error || !role.data) throw new Error('هذه الصفحة مخصصة للإدارة فقط');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // 1. Try complaints_suggestions table
    try {
      const res = await supabaseAdmin
        .from('complaints_suggestions' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (!res.error && res.data && res.data.length > 0) {
        return res.data;
      }
    } catch {}

    // 2. Fallback: Parse from admin notifications
    try {
      const notifs = await supabaseAdmin
        .from('notifications')
        .select('*')
        .or('title.ilike.%[شكوى%,title.ilike.%[اقتراح%,title.ilike.%[طلب انضمام%,title.ilike.%[طلب إضافة%')
        .order('created_at', { ascending: false })
        .limit(100);

      if (notifs.data && notifs.data.length > 0) {
        const tickets: any[] = [];
        for (const n of notifs.data) {
          let ticketType: 'complaint' | 'suggestion' | 'inquiry' = 'complaint';
          if (n.title.includes('اقتراح')) ticketType = 'suggestion';
          if (n.title.includes('استفسار')) ticketType = 'inquiry';
          if (n.title.includes('دليفري') || n.title.includes('متجر')) ticketType = 'suggestion';

          let customerName = 'عميل';
          let phone = '';
          let desc = n.body;

          const matchName = n.body.match(/(?:من|الاسم|اسم النشاط):\s*([^\n|]+)/);
          if (matchName) customerName = matchName[1].trim();

          const matchPhone = n.body.match(/(?:هاتف|الهاتف|التليفون):\s*([0-9+]+)/);
          if (matchPhone) phone = matchPhone[1].trim();

          const payloadMatch = n.body.match(/\[(?:TICKET_PAYLOAD|APPLICATION_PAYLOAD):(\{.*?\})\]/);
          let imageUrl: string | null = null;
          if (payloadMatch) {
            try {
              const p = JSON.parse(payloadMatch[1]);
              if (p.image_url) imageUrl = p.image_url;
              if (p.customer_name) customerName = p.customer_name;
              if (p.full_name) customerName = p.full_name;
              if (p.store_name) customerName = p.store_name;
              if (p.phone) phone = p.phone;
              if (p.description) desc = p.description;
            } catch {}
          }

          tickets.push({
            id: n.id,
            user_id: n.user_id,
            customer_name: customerName,
            phone: phone,
            type: ticketType,
            title: n.title.replace(/^📩\s*|\[.*?\]:\s*/g, ''),
            description: desc.replace(/\n\[(?:TICKET_PAYLOAD|APPLICATION_PAYLOAD):.*?\]/g, ''),
            image_url: imageUrl,
            status: n.is_read ? 'resolved' : 'pending',
            admin_reply: null,
            replied_at: null,
            created_at: n.created_at,
          });
        }
        return tickets;
      }
    } catch {}

    return [];
  });

export const adminReplyToTicket = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      ticketId: z.string(),
      targetUserId: z.string().optional(),
      replyText: z.string().trim().min(1),
      status: z.enum(['in_review', 'resolved', 'closed']).default('resolved'),
    })
  )
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (role.error || !role.data) throw new Error('هذه العملية مخصصة للإدارة فقط');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // 1. Try complaints_suggestions
    try {
      await supabaseAdmin
        .from('complaints_suggestions' as any)
        .update({
          admin_reply: data.replyText,
          status: data.status,
          replied_at: new Date().toISOString(),
        } as any)
        .eq('id', data.ticketId);
    } catch {}

    // 2. Mark notification as read if it was a notification-based ticket
    try {
      await supabaseAdmin
        .from('notifications')
        .update({ is_read: true })
        .eq('id', data.ticketId);
    } catch {}

    // 3. Send notification & push to the user
    if (data.targetUserId) {
      try {
        const { sendNotificationWithPush } = await import('@/lib/push.functions');
        await sendNotificationWithPush({
          userId: data.targetUserId,
          title: '💬 رد الإدارة على طلبك / شكواك',
          body: data.replyText,
          path: '/account',
          tag: `husayniya-ticket-reply-${data.ticketId}`,
        });
      } catch (e) {
        console.error('Failed to notify customer of admin reply:', e);
      }
    }

    return { success: true };
  });
