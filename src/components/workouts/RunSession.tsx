import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Flag,
  LocateFixed,
  LocateOff,
  Pause,
  Play,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SessionStat } from "@/components/workouts/SessionStat";
import { useRunTracking, type GpsStatus } from "@/hooks/use-run-tracking";
import { buildRunSteps, formatVolume, stepsDistanceKm, type RunStep } from "@/lib/run-blocks";
import { evaluateCoach, finishCue, initialCoachState } from "@/lib/run-coach";
import { currentPace, formatPace, paceSecondsPerKm, stepTargetMeters } from "@/lib/run-gps";
import { announceRunStep } from "@/lib/run-notifications";
import { createSpeechQueue } from "@/lib/run-voice";
import { listZonePaces, zonePacesQueryKey } from "@/lib/run-zone-paces";
import { formatTime } from "@/lib/workout-ui";
import type { Workout } from "@/lib/workouts";

// lottie-web é pesado: fica num chunk próprio, pré-carregado quando a sessão começa.
const loadStreakCelebration = () => import("@/components/workouts/StreakCelebration");
const StreakCelebration = lazy(loadStreakCelebration);

type StepOutcome = "done" | "skipped";

type RunSessionProps = {
  workout: Workout;
  onExit: () => void;
  onFinish: () => void;
};

/** Cronômetro da etapa por timestamps: continua certo mesmo com o WebView em segundo plano. */
type StepTimer = { startedAt: number; pausedMs: number; pausedAt: number | null };

function newStepTimer(): StepTimer {
  return { startedAt: Date.now(), pausedMs: 0, pausedAt: null };
}

function timerSeconds(timer: StepTimer, now: number) {
  const pausedNow = timer.pausedAt === null ? 0 : now - timer.pausedAt;
  return Math.max(0, Math.floor((now - timer.startedAt - timer.pausedMs - pausedNow) / 1000));
}

function formatDistance(km: number) {
  if (km === 0) return "—";
  return km < 1
    ? `${Math.round(km * 1000)} m`
    : `${km.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km`;
}

function formatLiveDistance(meters: number) {
  return meters < 1000
    ? `${Math.floor(meters)} m`
    : `${(meters / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
}

function stepKindLabel(step: RunStep) {
  if (step.kind === "recovery") return "RECUPERAÇÃO";
  return step.label.startsWith("Tiro") ? "TIRO" : "BLOCO";
}

const VOICE_STORAGE_KEY = "finnote-run-voice";

function readVoicePreference() {
  try {
    return localStorage.getItem(VOICE_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveVoicePreference(on: boolean) {
  try {
    localStorage.setItem(VOICE_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Sem armazenamento: a preferência vale só nesta sessão.
  }
}

const GPS_STATUS_LABEL: Record<GpsStatus, string> = {
  waiting: "Procurando GPS…",
  ok: "GPS ativo",
  weak: "Sinal de GPS fraco",
  denied: "GPS sem permissão · conclua as etapas manualmente",
  unavailable: "GPS indisponível · conclua as etapas manualmente",
};

/**
 * Modo Execução da Corrida: percorre as etapas geradas pelos blocos
 * (Tiro 1, Recuperação 1, Tiro 2...). O GPS mede distância e pace; etapas por
 * distância concluem ao atingir o alvo e etapas por tempo ao zerar a contagem.
 * O treinador por voz anuncia etapas, quilômetros, o fim próximo e o pace fora da zona.
 */
export function RunSession({ workout, onExit, onFinish }: RunSessionProps) {
  const steps = useMemo(() => buildRunSteps(workout.runBlocks), [workout.runBlocks]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<StepOutcome[]>([]);
  const [stepTimer, setStepTimer] = useState(newStepTimer);
  const [now, setNow] = useState(() => Date.now());
  const [finishedDuration, setFinishedDuration] = useState<number | null>(null);
  const [showStreakCelebration, setShowStreakCelebration] = useState(false);
  const [stepStartMeters, setStepStartMeters] = useState(0);
  const startedAt = useRef(Date.now());

  const finished = finishedDuration !== null;
  const paused = stepTimer.pausedAt !== null;
  const { track, status: gpsStatus } = useRunTracking({ active: !finished, paused });
  const { data: zonePaces } = useQuery({
    queryKey: zonePacesQueryKey,
    queryFn: listZonePaces,
    staleTime: Infinity,
  });
  const [voiceOn, setVoiceOn] = useState(readVoicePreference);
  const [speech] = useState(() => createSpeechQueue());
  const coachState = useRef(initialCoachState);

  useEffect(() => {
    void loadStreakCelebration();
  }, []);

  useEffect(() => () => void speech.clear(), [speech]);

  useEffect(() => {
    if (finished) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [finished]);

  // Em segundo plano os timers do WebView atrasam; cada ponto do GPS também atualiza o relógio.
  useEffect(() => setNow(Date.now()), [track]);

  useEffect(() => {
    if (finished) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [finished]);

  const step = steps[currentIndex];
  const timed = step?.unit === "min";
  const stepSeconds = timerSeconds(stepTimer, now);
  const remaining = step ? Math.max(0, Math.round(step.volume * 60) - stepSeconds) : 0;
  const targetMeters = step ? stepTargetMeters(step.volume, step.unit) : null;
  const stepMeters = track.meters - stepStartMeters;
  const autoComplete =
    !finished &&
    step !== undefined &&
    (timed ? remaining === 0 : targetMeters !== null && stepMeters >= targetMeters);
  const gpsTracking = gpsStatus === "ok" || gpsStatus === "weak";
  const pace = currentPace(track);
  const avgPace = paceSecondsPerKm(track.meters, track.movingMs / 1000);
  const zonePace = step ? zonePaces?.[step.intensity] : undefined;

  useEffect(() => {
    if (finished || paused || !voiceOn || !step) return;
    const { state, cues } = evaluateCoach(coachState.current, {
      now,
      stepIndex: currentIndex,
      step,
      stepSeconds,
      stepMeters,
      targetMeters,
      remainingSeconds: timed ? remaining : null,
      totalMeters: track.meters,
      currentPace: pace,
      avgPace,
      zonePace,
      gpsTracking,
    });
    coachState.current = state;
    for (const cue of cues) speech.say(cue.text, cue.priority);
    // O treinador reage ao relógio e aos pontos do GPS; os demais valores derivam deles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, track, currentIndex, finished, paused, voiceOn]);

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    saveVoicePreference(next);
    if (!next) void speech.clear();
  }

  function resolveStep(outcome: StepOutcome, automatic = false) {
    const nextOutcomes = [...outcomes, outcome];
    setOutcomes(nextOutcomes);
    setStepTimer(newStepTimer());
    setStepStartMeters(track.meters);

    if (currentIndex + 1 >= steps.length) {
      const duration = Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000));
      setNow(Date.now());
      setFinishedDuration(duration);
      if (automatic) void announceRunStep("Treino finalizado", workout.name);
      if (voiceOn) {
        const cue = finishCue(track.meters, avgPace);
        speech.say(cue.text, cue.priority);
      }
      // Simula o aumento da ofensiva até existir a contagem real de streaks.
      setShowStreakCelebration(true);
      return;
    }

    const next = steps[currentIndex + 1]!;
    if (automatic) {
      void announceRunStep(
        next.label,
        `${next.intensity} · ${formatVolume(next.volume, next.unit)}`,
      );
    }
    setCurrentIndex(currentIndex + 1);
  }

  useEffect(() => {
    if (autoComplete) resolveStep("done", true);
    // Dispara só na transição para "alvo atingido"; resolveStep zera o alvo da etapa seguinte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoComplete]);

  if (steps.length === 0) {
    return (
      <div className="p-6 text-muted-foreground">Este treino não possui blocos cadastrados.</div>
    );
  }

  function togglePause() {
    setStepTimer((timer) =>
      timer.pausedAt === null
        ? { ...timer, pausedAt: Date.now() }
        : { ...timer, pausedMs: timer.pausedMs + Date.now() - timer.pausedAt, pausedAt: null },
    );
  }

  function leave() {
    if (window.confirm("Sair do treino? O progresso desta sessão não será salvo.")) onExit();
  }

  if (finishedDuration !== null) {
    const doneSteps = steps.filter((_, index) => outcomes[index] === "done");
    const doneIntervals = doneSteps.filter((step) => step.kind === "active").length;
    const totalIntervals = steps.filter((step) => step.kind === "active").length;
    const plannedKm = stepsDistanceKm(doneSteps);
    const measured = track.meters > 0;

    return (
      <div className="min-h-screen bg-background px-5 pb-16 pt-10">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Flag className="size-8" aria-hidden />
        </span>
        <h1 className="mt-6 text-2xl font-black uppercase tracking-[0.1em] text-foreground">
          Treino finalizado
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{workout.name}</p>

        <dl className="mt-8 grid grid-cols-2 gap-3">
          <SessionStat label="Tempo total" value={formatTime(finishedDuration)} />
          <SessionStat label="Etapas" value={`${doneSteps.length}/${steps.length}`} />
          <SessionStat label="Tiros / blocos" value={`${doneIntervals}/${totalIntervals}`} />
          <SessionStat
            label={measured ? "Distância (GPS)" : "Distância"}
            value={measured ? formatLiveDistance(track.meters) : formatDistance(plannedKm)}
          />
          {measured && <SessionStat label="Pace médio" value={`${formatPace(avgPace)}/km`} />}
          {measured && (
            <SessionStat label="Distância planejada" value={formatDistance(plannedKm)} />
          )}
        </dl>

        <Button
          className="mt-10 h-14 w-full rounded-2xl text-base font-black tracking-[0.1em]"
          onClick={onFinish}
        >
          VOLTAR AOS TREINOS
        </Button>

        {showStreakCelebration && (
          <Suspense fallback={null}>
            <StreakCelebration onFinish={() => setShowStreakCelebration(false)} />
          </Suspense>
        )}
      </div>
    );
  }

  const current = step!;
  const isRecovery = current.kind === "recovery";
  // Sem GPS a etapa por distância volta ao modo manual: o destaque é o tempo da etapa.
  const showDistanceGoal =
    !timed && targetMeters !== null && gpsStatus !== "denied" && gpsStatus !== "unavailable";
  const distanceProgress = targetMeters ? Math.min(100, (stepMeters / targetMeters) * 100) : 0;
  const elapsed = Math.floor((now - startedAt.current) / 1000);
  const progress = (currentIndex / steps.length) * 100;
  const upcoming = steps.slice(currentIndex + 1, currentIndex + 5);
  const isLastStep = currentIndex === steps.length - 1;
  const paceLabel = formatPace(pace);
  const paceTone =
    pace === null || !zonePace
      ? "text-foreground"
      : pace >= zonePace.fastSec && pace <= zonePace.slowSec
        ? "text-primary"
        : "text-destructive";

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="px-5 pt-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={leave}
            aria-label="Sair do treino"
            className="flex size-10 items-center justify-center rounded-full bg-surface-inactive text-foreground"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-black uppercase tracking-[0.1em] text-foreground">
              {workout.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              Etapa {currentIndex + 1} de {steps.length} · {formatTime(elapsed)}
              {track.meters > 0 && ` · ${formatLiveDistance(track.meters)}`}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleVoice}
            aria-label={voiceOn ? "Desligar treinador por voz" : "Ligar treinador por voz"}
            aria-pressed={voiceOn}
            className={`flex size-10 items-center justify-center rounded-full bg-surface-inactive ${
              voiceOn ? "text-primary" : "text-muted-foreground"
            }`}
          >
            {voiceOn ? (
              <Volume2 className="size-5" aria-hidden />
            ) : (
              <VolumeX className="size-5" aria-hidden />
            )}
          </button>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-inactive">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p
          className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${
            gpsStatus === "ok" ? "text-primary" : "text-muted-foreground"
          }`}
          role="status"
        >
          {gpsTracking || gpsStatus === "waiting" ? (
            <LocateFixed className="size-3.5" aria-hidden />
          ) : (
            <LocateOff className="size-3.5" aria-hidden />
          )}
          {GPS_STATUS_LABEL[gpsStatus]}
        </p>
      </header>

      <section className="mt-4 px-5">
        <div
          className={`rounded-3xl border p-6 text-center ${
            isRecovery ? "border-border bg-card" : "border-primary/50 bg-primary/10"
          }`}
        >
          <p
            className={`text-xs font-black tracking-[0.2em] ${
              isRecovery ? "text-muted-foreground" : "text-primary"
            }`}
          >
            {stepKindLabel(current)}
          </p>
          <h2 className="mt-1 text-lg font-bold text-foreground">{current.label}</h2>

          <p
            className={`mt-4 text-6xl font-black ${
              isRecovery ? "text-muted-foreground" : "text-primary"
            }`}
          >
            {current.intensity}
          </p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {formatVolume(current.volume, current.unit)}
          </p>
          {zonePace && (
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Alvo {formatPace(zonePace.fastSec)}–{formatPace(zonePace.slowSec)}/km
            </p>
          )}

          <div className="mt-6">
            {showDistanceGoal ? (
              <>
                <p className="text-xs font-black tracking-[0.15em] text-muted-foreground">
                  DISTÂNCIA DA ETAPA
                </p>
                <p className="mt-1 text-5xl font-black tabular-nums text-foreground">
                  {formatLiveDistance(stepMeters)}
                </p>
                <div className="mx-auto mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-inactive">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${distanceProgress}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-black tracking-[0.15em] text-muted-foreground">
                  {timed ? "TEMPO RESTANTE" : "TEMPO DA ETAPA"}
                </p>
                <p className="mt-1 text-5xl font-black tabular-nums text-foreground">
                  {timed ? formatTime(remaining) : formatTime(stepSeconds)}
                </p>
              </>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-2 text-left">
              <div className="rounded-2xl bg-background/60 px-3 py-2">
                <dt className="text-[10px] font-black tracking-[0.15em] text-muted-foreground">
                  {showDistanceGoal ? "TEMPO DA ETAPA" : "DISTÂNCIA"}
                </dt>
                <dd className="text-lg font-bold tabular-nums text-foreground">
                  {showDistanceGoal
                    ? formatTime(stepSeconds)
                    : gpsTracking
                      ? formatLiveDistance(stepMeters)
                      : "—"}
                </dd>
              </div>
              <div className="rounded-2xl bg-background/60 px-3 py-2">
                <dt className="text-[10px] font-black tracking-[0.15em] text-muted-foreground">
                  PACE ATUAL
                </dt>
                <dd className={`text-lg font-bold tabular-nums ${paceTone}`}>
                  {paceLabel === "—" ? paceLabel : `${paceLabel}/km`}
                </dd>
              </div>
            </dl>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              aria-label={paused ? "Retomar treino" : "Pausar treino"}
              onClick={togglePause}
            >
              {paused ? (
                <Play className="size-4" aria-hidden />
              ) : (
                <Pause className="size-4" aria-hidden />
              )}
              {paused ? "Retomar" : "Pausar"}
            </Button>
          </div>

          <Button
            type="button"
            className="mt-6 h-14 w-full rounded-2xl text-base font-black tracking-[0.08em]"
            onClick={() => resolveStep("done")}
          >
            <Check className="size-5" aria-hidden />
            {isLastStep ? "FINALIZAR TREINO" : "CONCLUIR ETAPA"}
          </Button>
        </div>

        {upcoming.length > 0 && (
          <section className="mt-6" aria-labelledby="next-steps-title">
            <h2
              id="next-steps-title"
              className="mb-2 text-xs font-black uppercase tracking-[0.15em] text-muted-foreground"
            >
              A seguir
            </h2>
            <ul className="space-y-2">
              {upcoming.map((next) => (
                <li
                  key={next.key}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-sm"
                >
                  <span
                    className={`w-10 shrink-0 text-center font-black ${
                      next.kind === "recovery" ? "text-muted-foreground" : "text-primary"
                    }`}
                  >
                    {next.intensity}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{next.label}</span>
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                    {formatVolume(next.volume, next.unit)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>

      <footer className="fixed inset-x-0 bottom-0 flex gap-3 border-t border-border bg-background/95 p-4 backdrop-blur">
        <Button
          type="button"
          variant="outline"
          className="h-12 flex-1 rounded-2xl"
          onClick={() => resolveStep("skipped")}
        >
          <SkipForward className="size-4" aria-hidden />
          Pular etapa
        </Button>
      </footer>
    </div>
  );
}
