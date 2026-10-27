import { QueueStrategy, TextToSpeech } from "@capacitor-community/text-to-speech";

export type CuePriority = "high" | "low";

/**
 * Motor de fala do treinador. Hoje é o TTS nativo do aparelho; uma voz de IA na nuvem
 * pode entrar depois implementando esta mesma interface.
 */
export type RunVoice = {
  speak(text: string): Promise<void>;
  stop(): Promise<void>;
};

export const nativeVoice: RunVoice = {
  speak: (text) =>
    TextToSpeech.speak({
      text,
      lang: "pt-BR",
      rate: 1.05,
      // iOS: continua falando em segundo plano.
      category: "playback",
      queueStrategy: QueueStrategy.Add,
    }),
  stop: () => TextToSpeech.stop(),
};

/**
 * Fila de falas: uma frase por vez. Avisos de baixa prioridade (pace periódico) são
 * descartados quando já há algo na fila, para a voz não ficar atrasada em relação à corrida.
 */
export function createSpeechQueue(voice: RunVoice = nativeVoice) {
  const queue: string[] = [];
  let speaking = false;

  async function drain() {
    if (speaking) return;
    speaking = true;
    while (queue.length > 0) {
      const text = queue.shift()!;
      try {
        await voice.speak(text);
      } catch {
        // Sem TTS disponível (ex.: navegador sem vozes): o treino segue sem a fala.
      }
    }
    speaking = false;
  }

  return {
    say(text: string, priority: CuePriority) {
      if (priority === "low" && (speaking || queue.length > 0)) return;
      queue.push(text);
      void drain();
    },
    async clear() {
      queue.length = 0;
      await voice.stop().catch(() => {});
    },
  };
}
