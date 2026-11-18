import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { pushTokenInput, isStalePushToken } from './push-rules';

export const registerPushDevice = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator(pushTokenInput)
  .handler(async ({ data, context }) => {
    const result = await context.supabase
      .from('customer_push_devices')
      .upsert(
        { user_id: context.userId, token: data.token, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,token' }
      );
    if (result.error) throw new Error('تعذر حفظ إعدادات إشعارات هذا الجهاز');
    return { registered: true };
  });

type ServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function getFirebaseServiceAccount(): ServiceAccount | null {
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT_JSON'];
  if (raw) {
    try {
      const sa = JSON.parse(raw);
      if (sa.client_email && sa.private_key) {
        return {
          projectId: sa.project_id || 'mawgood1',
          clientEmail: sa.client_email,
          privateKey: sa.private_key,
        };
      }
    } catch {}
  }

  const clientEmail = process.env['FIREBASE_CLIENT_EMAIL'];
  const privateKey = process.env['FIREBASE_PRIVATE_KEY'];
  const projectId = process.env['FIREBASE_PROJECT_ID'] || 'mawgood1';
  if (clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const { createSign } = await import('node:crypto');
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claimSet = Buffer.from(
    JSON.stringify({
      iss: sa.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  ).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${claimSet}`);
  const signature = sign.sign(sa.privateKey, 'base64url');
  const jwt = `${header}.${claimSet}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`تعذر الحصول على مصادقة Firebase من Google [${res.status}]: ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  };
  return data.access_token;
}

async function dispatchFcmMessage(
  token: string,
  messagePayload: {
    title: string;
    body: string;
    path?: string;
    tag?: string;
    requireInteraction?: boolean;
    test?: boolean;
  }
): Promise<{ ok: boolean; status: number; body: string; code?: string }> {
  const sa = getFirebaseServiceAccount();

  if (sa) {
    const accessToken = await getFcmAccessToken(sa);
    const fcmRes = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.projectId}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title: messagePayload.title,
            body: messagePayload.body,
          },
          data: {
            path: messagePayload.path || '/orders',
            title: messagePayload.title,
            body: messagePayload.body,
            test: messagePayload.test ? 'true' : 'false',
          },
          webpush: {
            notification: {
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: messagePayload.tag || 'mawgood-push',
              renotify: true,
              requireInteraction: messagePayload.requireInteraction ?? false,
              vibrate: [200, 100, 200],
              data: {
                path: messagePayload.path || '/orders',
              },
            },
            fcm_options: {
              link: messagePayload.path || '/orders',
            },
          },
        },
      }),
    });

    const bodyText = await fcmRes.text();
    let code: string | undefined;
    try {
      const parsed = JSON.parse(bodyText);
      code = parsed.error?.details?.find((d: { errorCode?: string }) => d.errorCode)?.errorCode || parsed.error?.status;
    } catch {}

    return {
      ok: fcmRes.ok,
      status: fcmRes.status,
      body: bodyText,
      code,
    };
  }

  // Fallback to connector gateway if service account not provided
  const key = process.env['LOVABLE_API_KEY'];
  const connectionKey = process.env['FIREBASE_MESSAGING_API_KEY'];
  if (!key || !connectionKey) {
    throw new Error('إعدادات إرسال الإشعارات غير متاحة؛ يرجى إضافة FIREBASE_SERVICE_ACCOUNT_JSON في لوحة تحكم Vercel.');
  }

  const legacyRes = await fetch('https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'X-Connection-Api-Key': connectionKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: messagePayload.title, body: messagePayload.body },
        data: { path: messagePayload.path || '/orders', test: messagePayload.test ? 'true' : 'false' },
        webpush: {
          notification: {
            icon: '/icon-192.png',
            tag: messagePayload.tag || 'mawgood-push',
          },
        },
      },
    }),
  });

  const bodyText = await legacyRes.text();
  let code: string | undefined;
  try {
    code = JSON.parse(bodyText).error?.details?.find((d: { errorCode?: string }) => d.errorCode)?.errorCode;
  } catch {}

  return {
    ok: legacyRes.ok,
    status: legacyRes.status,
    body: bodyText,
    code,
  };
}

export const sendTestPush = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .validator(pushTokenInput)
  .handler(async ({ data, context }) => {
    const device = await context.supabase
      .from('customer_push_devices')
      .select('id,token')
      .eq('user_id', context.userId)
      .eq('token', data.token)
      .maybeSingle();

    if (device.error || !device.data) throw new Error('فعّل إشعارات هذا الجهاز أولًا');

    const result = await dispatchFcmMessage(device.data.token, {
      title: 'موجود',
      body: 'إشعار اختبار: إشعارات طلباتك جاهزة على هذا الجهاز.',
      path: '/orders',
      test: true,
      tag: 'mawgood-push-test',
    });

    if (!result.ok) {
      const safeBody = result.body.split(device.data.token).join('[device]');
      console.error(`Firebase send failed [${result.status}]: ${safeBody}`);
      if (isStalePushToken(result.status, result.code)) {
        await context.supabase.from('customer_push_devices').delete().eq('id', device.data.id).eq('user_id', context.userId);
      }
      throw new Error(`تعذر إرسال الإشعار [${result.status}]: ${safeBody}`);
    }

    return { accepted: true };
  });

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; path?: string; tag?: string; requireInteraction?: boolean }
): Promise<void> {
  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

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
          const result = await dispatchFcmMessage(device.token, payload);
          if (!result.ok && isStalePushToken(result.status, result.code)) {
            await supabaseAdmin.from('customer_push_devices').delete().eq('id', device.id);
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
      tag: params.tag || `mawgood-notif-${Date.now()}`,
    });
  } catch (e) {
    console.error('Failed in sendNotificationWithPush:', e);
  }
}
