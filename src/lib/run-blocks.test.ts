import { describe, expect, it } from "vitest";

import {
  buildRunSteps,
  describeRunBlock,
  estimateRunMinutes,
  runBlockSchema,
  stepsDistanceKm,
  type RunBlock,
} from "./run-blocks";

const warmUp: RunBlock = {
  sets: 1,
  intensity: "Z2",
  volume: 2,
  volumeUnit: "km",
  recovery: null,
};

const intervals: RunBlock = {
  sets: 5,
  intensity: "Z4",
  volume: 1,
  volumeUnit: "km",
  recovery: { intensity: "Z2", volume: 500, unit: "m" },
};

describe("buildRunSteps", () => {
  it("intercala tiros e recuperações de um bloco repetido", () => {
    const steps = buildRunSteps([intervals]);

    expect(steps).toHaveLength(10);
    expect(steps.map((step) => step.label).slice(0, 4)).toEqual([
      "Tiro 1 de 5",
      "Recuperação 1 de 5",
      "Tiro 2 de 5",
      "Recuperação 2 de 5",
    ]);
    expect(steps[1]).toMatchObject({ kind: "recovery", intensity: "Z2", volume: 500, unit: "m" });
  });

  it("gera uma etapa por bloco simples e só tiros quando não há recuperação", () => {
    const steps = buildRunSteps([warmUp, { ...intervals, sets: 3, recovery: null }]);

    expect(steps.map((step) => step.label)).toEqual([
      "Bloco 1",
      "Tiro 1 de 3",
      "Tiro 2 de 3",
      "Tiro 3 de 3",
    ]);
    expect(new Set(steps.map((step) => step.key)).size).toBe(steps.length);
  });

  it("soma a distância em km ignorando etapas por tempo", () => {
    const steps = buildRunSteps([warmUp, intervals, { ...warmUp, volume: 10, volumeUnit: "min" }]);
    expect(stepsDistanceKm(steps)).toBeCloseTo(2 + 5 * 1 + 5 * 0.5);
  });
});

describe("runBlockSchema", () => {
  it("rejeita recuperação em bloco de 1 série", () => {
    const result = runBlockSchema.safeParse({
      ...warmUp,
      recovery: { intensity: "Z1", volume: 1, unit: "km" },
    });
    expect(result.success).toBe(false);
  });

  it("aceita bloco repetido sem recuperação", () => {
    expect(runBlockSchema.safeParse({ ...intervals, recovery: null }).success).toBe(true);
  });
});

describe("formatação e estimativa", () => {
  it("descreve o bloco com a recuperação", () => {
    expect(describeRunBlock(intervals)).toBe("5× Z4 · 1 km + Z2 · 500 m");
    expect(describeRunBlock({ ...warmUp, volume: 1.5 })).toBe("1× Z2 · 1,5 km");
  });

  it("estima a duração usando 6 min/km", () => {
    // 2 km = 12 min; 5 × (1 km + 0,5 km) = 45 min; total 57 → arredonda para 55.
    expect(estimateRunMinutes([warmUp, intervals])).toBe(55);
  });
});
