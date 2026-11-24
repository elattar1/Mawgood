import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocked backend: no network, no real Supabase. Covers the iOS OAuth return handler only.
const listeners: Record<string, (e: any) => any> = {};
const setSession = vi.fn().mockResolvedValue({ error: null });
const closeBrowser = vi.fn().mockResolvedValue(undefined);

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (name: string, cb: (e: any) => any) => {
      listeners[name] = cb;
      return Promise.resolve({ remove: () => {} });
    },
    exitApp: vi.fn(),
  },
}));
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle: vi.fn(), setBackgroundColor: vi.fn(), setOverlaysWebView: vi.fn() },
  Style: { Dark: 'DARK' },
}));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: vi.fn() } }));
vi.mock('@capacitor/browser', () => ({ Browser: { close: closeBrowser } }));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: vi.fn().mockResolvedValue({ receive: 'denied' }),
    requestPermissions: vi.fn(),
    addListener: vi.fn(),
    register: vi.fn(),
  },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { setSession } } }));

describe('iOS OAuth custom-scheme return (mocked backend)', () => {
  beforeEach(() => {
    setSession.mockClear();
    closeBrowser.mockClear();
  });

  it('closes the browser sheet and sets the session from fragment tokens', async () => {
    const { initCapacitorApp } = await import('../capacitor');
    await initCapacitorApp();
    expect(typeof listeners['appUrlOpen']).toBe('function');
    await listeners['appUrlOpen']!({
      url: 'com.husayniya.services://auth-callback#access_token=AT&refresh_token=RT&token_type=bearer',
    });
    expect(closeBrowser).toHaveBeenCalledTimes(1);
    expect(setSession).toHaveBeenCalledWith({ access_token: 'AT', refresh_token: 'RT' });
  });

  it('does not set a session when the callback has no tokens', async () => {
    const { initCapacitorApp } = await import('../capacitor');
    await initCapacitorApp();
    await listeners['appUrlOpen']!({ url: 'com.husayniya.services://auth-callback?error=access_denied' });
    expect(setSession).not.toHaveBeenCalled();
  });
});
