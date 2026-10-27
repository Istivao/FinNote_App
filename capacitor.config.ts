import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.finnote.app",
  appName: "FinNote",
  webDir: "dist",
  android: {
    // Sem a bridge legada o Android interrompe os pontos do GPS após ~5 min em segundo plano
    // (exigência do @capgo/background-geolocation).
    useLegacyBridge: true,
  },
  plugins: {
    SplashScreen: {
      // Ocultada manualmente pelo React (src/lib/splash-screen.ts) após a primeira renderização.
      launchAutoHide: false,
      backgroundColor: "#090d16",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    Keyboard: {
      resize: "none",
    },
    LocalNotifications: {
      smallIcon: "ic_stat_finnote",
      iconColor: "#F5A847",
    },
    SystemBars: {
      insetsHandling: "css",
      style: "DARK",
    },
  },
};

export default config;
