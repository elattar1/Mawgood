import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { pushTokenInput, isStalePushToken } from './push-rules';

export const registerPushDevice = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(pushTokenInput)
  .handler(async ({ data, context }) => {
    const result = await context.supabase.from('customer_push_devices').upsert({ user_id: context.userId, token: data.token, updated_at: new Date().toISOString() }, { onConflict: 'user_id,token' });
    if (result.error) throw new Error('تعذر حفظ إعدادات إشعارات هذا الجهاز');
    return { registered: true };
  });

export const sendTestPush = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth]).inputValidator(pushTokenInput)
  .handler(async ({ data, context }) => {
    const device = await context.supabase.from('customer_push_devices').select('id,token').eq('user_id', context.userId).eq('token', data.token).maybeSingle();
    if (device.error || !device.data) throw new Error('فعّل إشعارات هذا الجهاز أولًا');
    const key = process.env['LOVABLE_API_KEY'];
    const connectionKey = process.env['FIREBASE_MESSAGING_API_KEY'];
    if (!key || !connectionKey) throw new Error('إعدادات إرسال الإشعارات غير متاحة؛ يلزم تحديث ربط Firebase');
    const response = await fetch('https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'X-Connection-Api-Key': connectionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token: device.data.token, notification: { title: 'خدمات الحسينية', body: 'إشعار اختبار: إشعارات طلباتك جاهزة على هذا الجهاز.' }, data: { path: '/orders', test: 'true' }, webpush: { notification: { icon: '/icon-192.png', tag: 'husayniya-push-test' } } } }),
    });
    if (!response.ok) {
      const body = await response.text();
      // Never log or return device registration tokens that a provider may echo.
      const safeBody = body.split(device.data.token).join('[device]');
      console.error(`Firebase send failed [${response.status}]: ${safeBody}`);
      let code: string | undefined;
      try { code = JSON.parse(body).error?.details?.find((d: { errorCode?: string }) => d.errorCode)?.errorCode; } catch { /* Non-JSON errors retain their status and body. */ }
      if (isStalePushToken(response.status, code)) await context.supabase.from('customer_push_devices').delete().eq('id', device.data.id).eq('user_id', context.userId);
      throw new Error(`تعذر إرسال الإشعار [${response.status}]: ${safeBody}`);
    }
    return { accepted: true };
  });

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; path?: string; tag?: string; requireInteraction?: boolean }
): Promise<void> {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const key = process.env['LOVABLE_API_KEY'];
    const connectionKey = process.env['FIREBASE_MESSAGING_API_KEY'];
    if (!key || !connectionKey) {
      return;
    }

    const { data: devices, error } = await supabaseAdmin
      .from('customer_push_devices')
      .select('id, token')
      .eq('user_id', userId);

    if (error || !devices || devices.length === 0) {
      return;
    }

    await Promise.allSettled(
      devices.map(async (device) => {
        try {
          const res = await fetch(
            'https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${key}`,
                'X-Connection-Api-Key': connectionKey,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: {
                  token: device.token,
                  notification: {
                    title: payload.title,
                    body: payload.body,
                  },
                  data: {
                    path: payload.path || '/orders',
                    title: payload.title,
                    body: payload.body,
                  },
                  webpush: {
                    notification: {
                      icon: '/icon-192.png',
                      badge: '/icon-192.png',
                      tag: payload.tag || 'husayniya-chat',
                      renotify: true,
                      requireInteraction: payload.requireInteraction ?? false,
                      vibrate: [200, 100, 200],
                      data: {
                        path: payload.path || '/orders',
                      },
                    },
                    fcm_options: {
                      link: payload.path || '/orders',
                    },
                  },
                },
              }),
            }
          );

          if (!res.ok) {
            const bodyText = await res.text();
            let code: string | undefined;
            try {
              code = JSON.parse(bodyText).error?.details?.find((d: { errorCode?: string }) => d.errorCode)?.errorCode;
            } catch {}
            if (isStalePushToken(res.status, code)) {
              await supabaseAdmin.from('customer_push_devices').delete().eq('id', device.id);
            }
          }
        } catch (e) {
          console.error('Firebase push send error:', e);
        }
      })
    );
  } catch (err) {
    console.error('sendPushToUser exception:', err);
  }
}

/**
 * دالة مركزية موحدة تضمن حفظ الإشعار الداخلي وإرسال إشعار خارجي (Push Notification) لهاتف المستخدم
 */
export async function sendNotificationWithPush(params: {
  userId: string;
  title: string;
  body: string;
  link?: string;
  path?: string;
  tag?: string;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const path = params.path || params.link || '/';
    const link = params.link || params.path || '/';

    // 1. إدراج الإشعار الداخلي في قاعدة البيانات
    await supabaseAdmin.from('notifications').insert({
      user_id: params.userId,
      title: params.title,
      body: params.body,
      link: link,
    });

    // 2. إرسال الإشعار الفوري لهاتف المستخدم خارج الموقع
    await sendPushToUser(params.userId, {
      title: params.title,
      body: params.body,
      path: path,
      tag: params.tag || `husayniya-notif-${Date.now()}`,
    });
  } catch (e) {
    console.error('Failed in sendNotificationWithPush:', e);
  }
}
