import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";

// Rede de segurança: se o React nunca chegar a montar (erro fatal no bundle),
// a splash nativa não pode ficar presa na tela para sempre.
const SPLASH_FALLBACK_TIMEOUT_MS = 8000;

let hidden = false;

export function hideSplashScreen() {
  if (hidden || !Capacitor.isNativePlatform()) return;
  hidden = true;
  void SplashScreen.hide({ fadeOutDuration: 200 }).catch((error: unknown) => {
    console.error("Falha ao ocultar a splash screen.", error);
  });
}

export function scheduleSplashScreenFallback() {
  if (!Capacitor.isNativePlatform()) return;
  window.setTimeout(hideSplashScreen, SPLASH_FALLBACK_TIMEOUT_MS);
}
