import { describe, expect, it } from "vitest";

import type { RunStep } from "./run-blocks";
import {
  evaluateCoach,
  finishCue,
  initialCoachState,
  spokenDistance,
  spokenDuration,
  spokenPace,
  type CoachSnapshot,
  type CoachState,
} from "./run-coach";

const tiro: RunStep = {
  key: "0-1-active",
  kind: "active",
  label: "Tiro 1 de 5",
  blockNumber: 1,
  intensity: "Z4",
  volume: 1,
  unit: "km",
};

const timedStep: RunStep = { ...tiro, label: "Bloco 1", volume: 5, unit: "min" };

function snapshot(overrides: Partial<CoachSnapshot> = {}): CoachSnapshot {
  return {
    now: 0,
    stepIndex: 0,
    step: tiro,
    stepSeconds: 0,
    stepMeters: 0,
    targetMeters: 1000,
    remainingSeconds: null,
    totalMeters: 0,
    currentPace: null,
    avgPace: null,
    zonePace: { fastSec: 270, slowSec: 290 },
    gpsTracking: true,
    ...overrides,
  };
}

/** Aplica as leituras em sequência e devolve todos os textos falados. */
function speakAll(snapshots: CoachSnapshot[], initial: CoachState = initialCoachState) {
  let state = initial;
  const spoken: string[] = [];
  for (const snap of snapshots) {
    const result = evaluateCoach(state, snap);
    state = result.state;
    spoken.push(...result.cues.map((cue) => cue.text));
  }
  return { state, spoken };
}

describe("frases faladas", () => {
  it("fala pace, distância e duração em português", () => {
    expect(spokenPace(332)).toBe("5 e 32");
    expect(spokenPace(300)).toBe("5 minutos");
    expect(spokenDistance(400)).toBe("400 metros");
    expect(spokenDistance(1500)).toBe("1 vírgula 5 quilômetro");
    expect(spokenDistance(8200)).toBe("8 vírgula 2 quilômetros");
    expect(spokenDuration(90)).toBe("1 minuto e 30 segundos");
    expect(spokenDuration(600)).toBe("10 minutos");
  });

  it("resume o treino ao finalizar", () => {
    expect(finishCue(8200, 340).text).toBe(
      "Treino concluído. 8 vírgula 2 quilômetros, pace médio 5 e 40.",
    );
    expect(finishCue(0, null).text).toBe("Treino concluído.");
  });
});

describe("evaluateCoach", () => {
  it("anuncia a etapa uma única vez, com o pace-alvo da zona", () => {
    const { spoken } = speakAll([snapshot(), snapshot({ now: 1000 })]);
    expect(spoken).toEqual(["Tiro 1 de 5. Zona 4, 1 quilômetro. Pace alvo entre 4 e 30 e 4 e 50."]);
  });

  it("fala cada quilômetro completo com o pace médio", () => {
    const { spoken } = speakAll([
      snapshot(),
      snapshot({ totalMeters: 1010, avgPace: 332 }),
      snapshot({ totalMeters: 1500, avgPace: 332 }),
    ]);
    expect(spoken.slice(1)).toEqual(["1 quilômetro. Pace médio 5 e 32."]);
  });

  it("avisa que faltam 100 metros", () => {
    const { spoken } = speakAll([
      snapshot(),
      snapshot({ stepMeters: 905 }),
      snapshot({ stepMeters: 950 }),
    ]);
    expect(spoken.slice(1)).toEqual(["Faltam 100 metros."]);
  });

  it("avisa os segundos finais das etapas por tempo", () => {
    const timed = { step: timedStep, targetMeters: null };
    const { spoken } = speakAll([
      snapshot({ ...timed, remainingSeconds: 300 }),
      snapshot({ ...timed, remainingSeconds: 30 }),
      snapshot({ ...timed, remainingSeconds: 10 }),
      snapshot({ ...timed, remainingSeconds: 9 }),
    ]);
    expect(spoken.slice(1)).toEqual(["Faltam 30 segundos.", "Faltam 10 segundos."]);
  });

  it("alerta o pace lento só depois de 15 s seguidos e respeita o intervalo", () => {
    const slow = (now: number) =>
      snapshot({ now, stepSeconds: 30 + now / 1000, stepMeters: 300, currentPace: 320 });
    const { spoken } = speakAll([snapshot(), slow(0), slow(10_000), slow(15_000), slow(30_000)]);
    expect(spoken.slice(1)).toEqual(["Acelere, pace 5 e 20."]);

    const later = speakAll([snapshot(), slow(0), slow(15_000), slow(60_000)]);
    expect(later.spoken.slice(1)).toEqual(["Acelere, pace 5 e 20.", "Acelere, pace 5 e 20."]);
  });

  it("avisa quando o pace volta ao alvo depois de um alerta", () => {
    const at = (now: number, currentPace: number) =>
      snapshot({ now, stepSeconds: 60, stepMeters: 300, currentPace });
    const { spoken } = speakAll([snapshot(), at(0, 250), at(15_000, 250), at(20_000, 280)]);
    expect(spoken.slice(1)).toEqual(["Diminua, pace 4 e 10.", "Pace no alvo."]);
  });

  it("não alerta pace sem faixa cadastrada para a zona", () => {
    const off = (now: number) =>
      snapshot({ now, stepSeconds: 60, stepMeters: 300, currentPace: 400, zonePace: undefined });
    const { spoken } = speakAll([off(0), off(20_000)]);
    expect(spoken).toEqual(["Tiro 1 de 5. Zona 4, 1 quilômetro."]);
  });
});
