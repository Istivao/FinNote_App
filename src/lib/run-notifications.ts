import { Capacitor } from "@capacitor/core";
import { Haptics } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";

const RUN_CHANNEL_ID = "finnote-run-v1";
// Fora das faixas usadas pelos lembretes de tarefas (1e9+) e de dieta (2e9+); reaproveitado
// para que cada troca de etapa substitua o aviso anterior.
const RUN_NOTIFICATION_ID = 900_001;

let channelReady: Promise<void> | null = null;

function ensureChannel() {
  channelReady ??= LocalNotifications.createChannel({
    id: RUN_CHANNEL_ID,
    name: "Treino de corrida",
    description: "Avisos de troca de etapa durante a corrida.",
    importance: 4,
    visibility: 1,
    vibration: true,
  }).catch(() => {
    channelReady = null;
  });
  return channelReady;
}

/**
 * Avisa a troca de etapa com o celular no bolso: vibra sempre e, com o app em
 * segundo plano ou a tela apagada, mostra também uma notificação.
 */
export async function announceRunStep(title: string, body: string) {
  void Haptics.vibrate({ duration: 800 }).catch(() => {
    // Sem suporte a vibração (ex.: navegador desktop).
  });

  if (!Capacitor.isNativePlatform() || document.visibilityState === "visible") return;
  try {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== "granted") return;
    await ensureChannel();
    await LocalNotifications.schedule({
      notifications: [{ id: RUN_NOTIFICATION_ID, channelId: RUN_CHANNEL_ID, title, body }],
    });
  } catch {
    // O aviso é complementar: o treino segue mesmo sem notificação.
  }
}
