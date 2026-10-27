import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Lottie } from "lottie-react";
import { useEffect, useRef } from "react";

// TODO: substituir pelo arquivo final da animação de ofensiva.
import streakAnimation from "@/assets/lottie/streak-placeholder.json";

type StreakCelebrationProps = {
  onFinish: () => void;
};

export default function StreakCelebration({ onFinish }: StreakCelebrationProps) {
  // Refs sobrevivem ao remount simulado do StrictMode, então vibra uma única vez.
  const vibrated = useRef(false);

  useEffect(() => {
    if (vibrated.current) return;
    vibrated.current = true;
    void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {
      // Sem suporte a vibração (ex.: navegador desktop): a animação segue normalmente.
    });
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-transparent"
      onClick={onFinish}
    >
      <span className="sr-only">Ofensiva aumentada!</span>
      <Lottie
        src={streakAnimation}
        autoplay
        loop={false}
        subscriptions={{ complete: onFinish }}
        className="pointer-events-none size-72 max-w-[80vw]"
        aria-hidden
      />
    </div>
  );
}
