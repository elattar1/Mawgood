// COPIES of the customer review, complaint and application handler bodies in customer.functions.ts (additive, for the native iOS
// endpoints only; the website handlers are NOT modified). Keep them in sync if those handlers change.
import { z } from "zod";

export const reviewInput = z.object({
      orderId: z.string().uuid(),
      storeId: z.string().uuid(),
      storeRating: z.number().min(1).max(5),
      storeComment: z.string().trim().max(500).optional(),
      driverRating: z.number().min(1).max(5).optional(),
      driverComment: z.string().trim().max(500).optional(),
    });

export async function reviewCore({ context, data }: { context: { userId: string }; data: z.infer<typeof reviewInput> }) {
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
}

export const complaintInput = z.object({
      type: z.enum(['complaint', 'suggestion', 'inquiry']).default('complaint'),
      title: z.string().trim().min(1),
      description: z.string().trim().min(1),
      customerName: z.string().trim().optional(),
      phone: z.string().trim().optional(),
      imageUrl: z.string().nullable().optional(),
    });

export async function complaintCore({ context, data }: { context: { userId: string }; data: z.infer<typeof complaintInput> }) {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // 0. حماية من الإغراق والرسائل التكرارية (Cooldown: دقيقتان)
    try {
      const recent = await supabaseAdmin
        .from('complaints_suggestions' as any)
        .select('id, created_at')
        .eq('user_id', context.userId)
        .gte('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();

      if (recent.data) {
        throw new Error('يرجى الانتظار دقيقتين قبل إرسال رسالة أو شكوى أخرى.');
      }
    } catch (chkErr: any) {
      if (chkErr?.message?.includes('دقيقتين')) throw chkErr;
    }

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
}

export const driverAppInput = z.object({
      fullName: z.string().trim().min(1),
      phone: z.string().trim().min(8),
      vehicleType: z.string().trim(),
      nationalId: z.string().trim().optional(),
    });

export async function driverAppCore({ context, data }: { context: { userId: string }; data: z.infer<typeof driverAppInput> }) {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // 0. منع تكرار طلبات الانضمام المتتالية (Cooldown: 15 دقيقة)
    try {
      const recent = await supabaseAdmin
        .from('driver_applications' as any)
        .select('id, created_at')
        .eq('user_id', context.userId)
        .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();

      if (recent.data) {
        throw new Error('لديك طلب انضمام قيد المراجعة تم إرساله مؤخرًا، سنتواصل معك هاتفياً قريباً.');
      }
    } catch (chkErr: any) {
      if (chkErr?.message?.includes('قيد المراجعة')) throw chkErr;
    }

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
}

export const merchantAppInput = z.object({
      storeName: z.string().trim().min(1),
      category: z.string().trim(),
      address: z.string().trim().min(1),
      phone: z.string().trim().min(8),
      description: z.string().trim().min(1),
    });

export async function merchantAppCore({ context, data }: { context: { userId: string }; data: z.infer<typeof merchantAppInput> }) {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // 0. منع تكرار طلبات إضافة المتاجر المتتالية (Cooldown: 15 دقيقة)
    try {
      const recent = await supabaseAdmin
        .from('merchant_applications' as any)
        .select('id, created_at')
        .eq('user_id', context.userId)
        .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();

      if (recent.data) {
        throw new Error('لديك طلب إضافة نشاط تجاري قيد المراجعة تم إرساله مؤخرًا، سيتم التواصل معك قريباً.');
      }
    } catch (chkErr: any) {
      if (chkErr?.message?.includes('قيد المراجعة')) throw chkErr;
    }

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
      body: `تم تسجيل طلب إضافة "${data.storeName}" بنجاح! سيقوم فريق إدارة موجود بمراجعته والتواصل معك لتفعيله.`,
      path: '/account',
      tag: `husayniya-merchant-app-cust-${Date.now()}`,
    });

    return { success: true };
}

export async function complaintsListCore({ context }: { context: { userId: string } }) {
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
}
