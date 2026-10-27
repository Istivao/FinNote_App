import type { RunIntensity, RunStep } from "@/lib/run-blocks";
import type { ZonePace } from "@/lib/run-zone-paces";
import type { CuePriority } from "@/lib/run-voice";

export type Cue = { text: string; priority: CuePriority };

/** Leitura do treino a cada ponto do GPS / segundo do cronômetro. */
export type CoachSnapshot = {
  now: number;
  stepIndex: number;
  step: RunStep;
  stepSeconds: number;
  stepMeters: number;
  /** Alvo da etapa por distância; null nas etapas por tempo. */
  targetMeters: number | null;
  /** Segundos restantes nas etapas por tempo; null nas por distância. */
  remainingSeconds: number | null;
  totalMeters: number;
  currentPace: number | null;
  avgPace: number | null;
  zonePace: ZonePace | undefined;
  /** GPS com sinal: sem ele não há distância nem pace para falar. */
  gpsTracking: boolean;
};

export type CoachState = {
  stepIndex: number;
  spokenKm: number;
  nearEnd: { distance: boolean; seconds30: boolean; seconds10: boolean };
  paceOff: { direction: "fast" | "slow"; since: number } | null;
  lastPaceAlertAt: number | null;
  paceAlerted: boolean;
};

export const initialCoachState: CoachState = {
  stepIndex: -1,
  spokenKm: 0,
  nearEnd: { distance: false, seconds30: false, seconds10: false },
  paceOff: null,
  lastPaceAlertAt: null,
  paceAlerted: false,
};

// Folga além da faixa da zona antes de considerar o pace fora do alvo.
const PACE_TOLERANCE_SEC = 5;
// O pace precisa ficar fora da faixa por esse tempo seguido para gerar alerta.
const PACE_OFF_MS = 15_000;
const PACE_ALERT_COOLDOWN_MS = 45_000;
// Arrancada e estabilização do GPS no começo da etapa não geram alerta.
const PACE_SETTLE_SECONDS = 20;

function plural(value: number, singular: string, pluralForm: string) {
  return value >= 2 ? pluralForm : singular;
}

function spokenNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  const [int, decimals] = rounded.toFixed(2).replace(/0+$/, "").split(".");
  return `${int} vírgula ${decimals}`;
}

/** 332 → "5 e 32"; 300 → "5 minutos". */
export function spokenPace(secondsPerKm: number) {
  const total = Math.round(secondsPerKm);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds === 0 ? `${minutes} minutos` : `${minutes} e ${seconds}`;
}

/** 400 → "400 metros"; 1500 → "1 vírgula 5 quilômetro"; 3000 → "3 quilômetros". */
export function spokenDistance(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} metros`;
  const km = Math.round(meters / 10) / 100;
  return `${spokenNumber(km)} ${plural(km, "quilômetro", "quilômetros")}`;
}

/** 90 → "1 minuto e 30 segundos". */
export function spokenDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  const parts = [];
  if (minutes > 0) parts.push(`${minutes} ${plural(minutes, "minuto", "minutos")}`);
  if (seconds > 0) parts.push(`${seconds} ${plural(seconds, "segundo", "segundos")}`);
  return parts.join(" e ") || "0 segundos";
}

export function spokenZone(zone: RunIntensity) {
  return `Zona ${zone.slice(1)}`;
}

function stepIntro(step: RunStep, zonePace: ZonePace | undefined) {
  const volume =
    step.unit === "min"
      ? spokenDuration(step.volume * 60)
      : spokenDistance(step.unit === "km" ? step.volume * 1000 : step.volume);
  const target = zonePace
    ? ` Pace alvo entre ${spokenPace(zonePace.fastSec)} e ${spokenPace(zonePace.slowSec)}.`
    : "";
  return `${step.label}. ${spokenZone(step.intensity)}, ${volume}.${target}`;
}

/** "Faltam X metros" só faz sentido em etapas bem maiores que o aviso. */
function nearEndMeters(targetMeters: number) {
  if (targetMeters >= 300) return 100;
  if (targetMeters >= 100) return 50;
  return null;
}

/** Decide o que falar agora. É chamada repetidamente; cada aviso sai uma única vez. */
export function evaluateCoach(
  previous: CoachState,
  snapshot: CoachSnapshot,
): { state: CoachState; cues: Cue[] } {
  const cues: Cue[] = [];
  let state = previous;
  const { now, step, zonePace } = snapshot;

  if (snapshot.stepIndex !== state.stepIndex) {
    state = {
      ...state,
      stepIndex: snapshot.stepIndex,
      nearEnd: { distance: false, seconds30: false, seconds10: false },
      paceOff: null,
      lastPaceAlertAt: null,
      paceAlerted: false,
    };
    cues.push({ text: stepIntro(step, zonePace), priority: "high" });
  }

  // Quilômetro completo no total do treino.
  const km = Math.floor(snapshot.totalMeters / 1000);
  if (snapshot.gpsTracking && km > state.spokenKm) {
    state = { ...state, spokenKm: km };
    const pace = snapshot.avgPace === null ? "" : ` Pace médio ${spokenPace(snapshot.avgPace)}.`;
    cues.push({
      text: `${km} ${plural(km, "quilômetro", "quilômetros")}.${pace}`,
      priority: "low",
    });
  }

  // Falta pouco para terminar a etapa.
  let nearEnd = false;
  if (snapshot.targetMeters !== null && snapshot.gpsTracking) {
    const warnAt = nearEndMeters(snapshot.targetMeters);
    const remaining = snapshot.targetMeters - snapshot.stepMeters;
    nearEnd = remaining < 100;
    if (warnAt !== null && remaining > 0 && remaining <= warnAt && !state.nearEnd.distance) {
      state = { ...state, nearEnd: { ...state.nearEnd, distance: true } };
      cues.push({ text: `Faltam ${warnAt} metros.`, priority: "high" });
    }
  }
  if (snapshot.remainingSeconds !== null) {
    const remaining = snapshot.remainingSeconds;
    const duration = step.volume * 60;
    nearEnd = remaining < 15;
    if (duration >= 120 && remaining <= 30 && remaining > 10 && !state.nearEnd.seconds30) {
      state = { ...state, nearEnd: { ...state.nearEnd, seconds30: true } };
      cues.push({ text: "Faltam 30 segundos.", priority: "high" });
    }
    if (duration >= 30 && remaining <= 10 && remaining > 0 && !state.nearEnd.seconds10) {
      state = { ...state, nearEnd: { ...state.nearEnd, seconds30: true, seconds10: true } };
      cues.push({ text: "Faltam 10 segundos.", priority: "high" });
    }
  }

  // Pace fora da faixa da zona.
  const pace = snapshot.currentPace;
  if (
    !zonePace ||
    !snapshot.gpsTracking ||
    pace === null ||
    snapshot.stepSeconds < PACE_SETTLE_SECONDS ||
    nearEnd
  ) {
    return { state: { ...state, paceOff: null }, cues };
  }

  const direction =
    pace > zonePace.slowSec + PACE_TOLERANCE_SEC
      ? "slow"
      : pace < zonePace.fastSec - PACE_TOLERANCE_SEC
        ? "fast"
        : null;

  if (direction === null) {
    const inRange = pace >= zonePace.fastSec && pace <= zonePace.slowSec;
    if (inRange && state.paceAlerted) {
      cues.push({ text: "Pace no alvo.", priority: "high" });
      state = { ...state, paceAlerted: false };
    }
    return { state: { ...state, paceOff: null }, cues };
  }

  const paceOff: CoachState["paceOff"] =
    state.paceOff?.direction === direction ? state.paceOff : { direction, since: now };
  state = { ...state, paceOff };
  const cooledDown =
    state.lastPaceAlertAt === null || now - state.lastPaceAlertAt >= PACE_ALERT_COOLDOWN_MS;
  if (now - paceOff.since >= PACE_OFF_MS && cooledDown) {
    const action = direction === "slow" ? "Acelere" : "Diminua";
    cues.push({ text: `${action}, pace ${spokenPace(pace)}.`, priority: "high" });
    state = { ...state, lastPaceAlertAt: now, paceAlerted: true };
  }

  return { state, cues };
}

export function finishCue(totalMeters: number, avgPace: number | null): Cue {
  const summary =
    totalMeters > 0
      ? ` ${spokenDistance(totalMeters)}${avgPace === null ? "" : `, pace médio ${spokenPace(avgPace)}`}.`
      : "";
  return { text: `Treino concluído.${summary}`, priority: "high" };
}
