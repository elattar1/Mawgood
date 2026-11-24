import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.husayniya.services',
  appName: 'موجود',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    // Default is production. Override at `cap sync` time (e.g. MAWGOOD_APP_URL=https://staging.example) to point a test build at another deployment.
    url: process.env.MAWGOOD_APP_URL || 'https://www.mawgood.store',
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      backgroundColor: '#ffffff',
      style: 'LIGHT',
    },
  },
};

export default config;
