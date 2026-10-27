import type { RunUnit } from "@/lib/run-blocks";

export type GpsFix = {
  latitude: number;
  longitude: number;
  /** Raio de incerteza em metros. */
  accuracy: number;
  /** Epoch em ms. */
  time: number;
};

export type TrackState = {
  /** Último ponto aceito; null no início ou logo após uma pausa. */
  last: GpsFix | null;
  meters: number;
  /** Tempo em movimento: soma dos intervalos entre pontos aceitos. */
  movingMs: number;
  /** Histórico recente (tempo, metros acumulados) para o pace atual. */
  samples: Array<{ time: number; meters: number }>;
};

// Pontos mais imprecisos que isso são ruído (prédios, túnel, sinal fraco).
export const MAX_ACCURACY_METERS = 25;
// ~43 km/h: acima disso o ponto é um salto do GPS, não corrida.
const MAX_SPEED_MPS = 12;
// Deslocamentos menores ficam acumulando até passar disso, o que evita somar o jitter parado.
const MIN_STEP_METERS = 3;
// Um intervalo maior que isso sem pontos (túnel, sinal perdido) não conta como tempo em movimento.
const MAX_GAP_MS = 30_000;
const PACE_WINDOW_MS = 30_000;

const EARTH_RADIUS_METERS = 6_371_000;

export const emptyTrack: TrackState = { last: null, meters: 0, movingMs: 0, samples: [] };

export function haversineMeters(
  a: Pick<GpsFix, "latitude" | "longitude">,
  b: Pick<GpsFix, "latitude" | "longitude">,
) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

/** Soma um ponto ao percurso, descartando ruído. Retorna o mesmo estado quando o ponto é ignorado. */
export function addFix(state: TrackState, fix: GpsFix): TrackState {
  if (fix.accuracy > MAX_ACCURACY_METERS) return state;
  if (!state.last) {
    return { ...state, last: fix, samples: [{ time: fix.time, meters: state.meters }] };
  }

  const dt = fix.time - state.last.time;
  if (dt <= 0) return state;

  const distance = haversineMeters(state.last, fix);
  if (distance / (dt / 1000) > MAX_SPEED_MPS) return state;
  if (distance < MIN_STEP_METERS) return state;

  const meters = state.meters + distance;
  const samples = [...state.samples, { time: fix.time, meters }].filter(
    (sample) => fix.time - sample.time <= PACE_WINDOW_MS,
  );
  return {
    last: fix,
    meters,
    movingMs: state.movingMs + (dt <= MAX_GAP_MS ? dt : 0),
    samples,
  };
}

/** Interrompe o segmento (pausa): o trecho até o próximo ponto não é somado. */
export function breakSegment(state: TrackState): TrackState {
  return { ...state, last: null, samples: [] };
}

/** Pace em segundos por km na janela recente, ou null sem dados suficientes. */
export function currentPace(state: TrackState) {
  const first = state.samples[0];
  const last = state.samples[state.samples.length - 1];
  if (!first || !last || last.time - first.time < 5_000) return null;
  return paceSecondsPerKm(last.meters - first.meters, (last.time - first.time) / 1000);
}

export function paceSecondsPerKm(meters: number, seconds: number) {
  // Menos de 20 m não dá um pace confiável.
  if (meters < 20 || seconds <= 0) return null;
  return seconds / (meters / 1000);
}

/** Ex.: 332 → "5'32\"". */
export function formatPace(secondsPerKm: number | null) {
  // Acima de 30 min/km a pessoa está parada ou andando muito devagar.
  if (secondsPerKm === null || secondsPerKm > 30 * 60) return "—";
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, "0")}"`;
}

/** Distância-alvo da etapa em metros; null para etapas por tempo. */
export function stepTargetMeters(volume: number, unit: RunUnit) {
  if (unit === "km") return volume * 1000;
  if (unit === "m") return volume;
  return null;
}
