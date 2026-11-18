export type PushResult = { status: 'registered'; token: string } | { status: 'not-configured' | 'unsupported' | 'open-in-new-tab' | 'denied' };

export const MAWGOOD_FIREBASE_CONFIG = {
  apiKey:
    import.meta.env['VITE_FIREBASE_API_KEY'] ||
    'AIzaSyBgINPoWluExPq-HtpjVbLVqaxMiuiw9JY',
  projectId:
    import.meta.env['VITE_FIREBASE_PROJECT_ID'] ||
    'mawgood1',
  appId:
    import.meta.env['VITE_FIREBASE_APP_ID'] ||
    '1:797533188146:web:1115fe04e3ed7fb7788c2b',
  messagingSenderId: '797533188146',
};

export const MAWGOOD_FIREBASE_VAPID_KEY =
  import.meta.env['VITE_FIREBASE_VAPID_KEY'] ||
  'BCDXWmdEJxSEb39foJSIKrLcddpOH9lZ9kSIKn1f6jbTxQ66vtFmGNZmgjQYczd1j9qKkFWmUZcYk9EQruKR6Wc';

export async function enablePush(forceRefresh = true): Promise<PushResult> {
  const config = MAWGOOD_FIREBASE_CONFIG;
  const vapidKey = MAWGOOD_FIREBASE_VAPID_KEY;

  if (!config.apiKey || !config.projectId || !config.appId || !vapidKey || !config.messagingSenderId) return { status: 'not-configured' };
  if (window.top !== window.self) return { status: 'open-in-new-tab' };
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return { status: 'unsupported' };
  const { getMessaging, getToken, deleteToken, isSupported, onMessage } = await import('firebase/messaging');
  if (!(await isSupported())) return { status: 'unsupported' };
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return { status: 'denied' };

  const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${new URLSearchParams(config).toString()}`);
  await registration.update().catch(() => {});
  if (!registration.active) await new Promise<void>((resolve, reject) => {
    const worker = registration.installing ?? registration.waiting;
    if (!worker) { reject(new Error('تعذر تجهيز استقبال الإشعارات')); return; }
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve();
      if (worker.state === 'redundant') reject(new Error('تعذر تجهيز استقبال الإشعارات'));
    });
  });
  const { initializeApp, getApps } = await import('firebase/app');
  const app = getApps().find(a => a.name === 'mawgood-messaging') ?? initializeApp(config, 'mawgood-messaging');
  const messaging = getMessaging(app);

  if (forceRefresh) {
    try {
      await deleteToken(messaging);
    } catch {}
  }

  let token: string | null = null;
  try {
    token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  } catch {
    try {
      await deleteToken(messaging);
      token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    } catch (e) {
      console.error('Failed to get FCM token:', e);
    }
  }

  if (!token) return { status: 'denied' };
  if (!foregroundListenerStarted) {
    onMessage(messaging, payload => {
      window.dispatchEvent(new CustomEvent('husayniya-push-received'));
      const targetPath = payload.data?.path || (payload as any).fcmOptions?.link || '/orders';
      void registration.showNotification(payload.notification?.title ?? 'موجود', {
        body: payload.notification?.body ?? '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { path: targetPath },
      });
    });
    foregroundListenerStarted = true;
  }
  return { status: 'registered', token };
}
let foregroundListenerStarted = false;
