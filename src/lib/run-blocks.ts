import { z } from "zod";

export const RUN_INTENSITIES = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z6"] as const;
export const RUN_UNITS = [
  { value: "km", label: "KM" },
  { value: "m", label: "METROS" },
  { value: "min", label: "MIN" },
] as const;

export const MAX_RUN_BLOCKS = 20;
export const MAX_RUN_SETS = 50;
export const MAX_RUN_VOLUME = 99999;

export type RunIntensity = (typeof RUN_INTENSITIES)[number];
export type RunUnit = (typeof RUN_UNITS)[number]["value"];

const intensitySchema = z.enum(RUN_INTENSITIES);
const unitSchema = z.enum(["km", "m", "min"]);
const volumeSchema = z.number().gt(0).max(MAX_RUN_VOLUME);

export const runBlockSchema = z
  .object({
    /** Multiplicador do bloco: 1x, 5x... */
    sets: z.number().int().min(1).max(MAX_RUN_SETS),
    intensity: intensitySchema,
    volume: volumeSchema,
    volumeUnit: unitSchema,
    /** Recuperação entre repetições; só existe quando o bloco se repete. */
    recovery: z
      .object({ intensity: intensitySchema, volume: volumeSchema, unit: unitSchema })
      .nullable()
      .default(null),
  })
  .refine((block) => block.sets > 1 || block.recovery === null, {
    message: "Um bloco de 1 série não tem recuperação.",
    path: ["recovery"],
  });

export type RunBlock = z.infer<typeof runBlockSchema>;

export function formatVolume(volume: number, unit: RunUnit) {
  const value = Number.isInteger(volume)
    ? String(volume)
    : volume.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return unit === "min" ? `${value} min` : `${value} ${unit}`;
}

/** Ex.: "5× Z4 · 1 km  +  Z2 · 500 m". */
export function describeRunBlock(block: RunBlock) {
  const active = `${block.sets}× ${block.intensity} · ${formatVolume(block.volume, block.volumeUnit)}`;
  if (!block.recovery) return active;
  const { intensity, volume, unit } = block.recovery;
  return `${active} + ${intensity} · ${formatVolume(volume, unit)}`;
}

// Pace de referência só para estimar a duração do treino na listagem.
const MINUTES_PER_KM = 6;

function volumeMinutes(volume: number, unit: RunUnit) {
  if (unit === "min") return volume;
  return (unit === "km" ? volume : volume / 1000) * MINUTES_PER_KM;
}

export function estimateRunMinutes(blocks: RunBlock[]) {
  const total = blocks.reduce((sum, block) => {
    const recovery = block.recovery ? volumeMinutes(block.recovery.volume, block.recovery.unit) : 0;
    return sum + block.sets * (volumeMinutes(block.volume, block.volumeUnit) + recovery);
  }, 0);
  return Math.max(5, Math.round(total / 5) * 5);
}

export type RunStep = {
  key: string;
  kind: "active" | "recovery";
  /** Ex.: "Tiro 2 de 5", "Recuperação 2 de 5", "Bloco 1". */
  label: string;
  blockNumber: number;
  intensity: RunIntensity;
  volume: number;
  unit: RunUnit;
};

/**
 * Gera as etapas do Modo Execução: cada bloco repetido vira etapas intercaladas
 * (Tiro 1, Recuperação 1, Tiro 2, Recuperação 2...).
 */
export function buildRunSteps(blocks: RunBlock[]): RunStep[] {
  return blocks.flatMap((block, blockIndex) => {
    const blockNumber = blockIndex + 1;
    if (block.sets === 1) {
      return [
        {
          key: `${blockIndex}-1-active`,
          kind: "active" as const,
          label: `Bloco ${blockNumber}`,
          blockNumber,
          intensity: block.intensity,
          volume: block.volume,
          unit: block.volumeUnit,
        },
      ];
    }

    return Array.from({ length: block.sets }, (_, repIndex) => {
      const rep = repIndex + 1;
      const steps: RunStep[] = [
        {
          key: `${blockIndex}-${rep}-active`,
          kind: "active",
          label: `Tiro ${rep} de ${block.sets}`,
          blockNumber,
          intensity: block.intensity,
          volume: block.volume,
          unit: block.volumeUnit,
        },
      ];
      if (block.recovery) {
        steps.push({
          key: `${blockIndex}-${rep}-recovery`,
          kind: "recovery",
          label: `Recuperação ${rep} de ${block.sets}`,
          blockNumber,
          intensity: block.recovery.intensity,
          volume: block.recovery.volume,
          unit: block.recovery.unit,
        });
      }
      return steps;
    }).flat();
  });
}

/** Distância em km das etapas informadas (etapas por tempo não entram). */
export function stepsDistanceKm(steps: RunStep[]) {
  return steps.reduce((sum, step) => {
    if (step.unit === "km") return sum + step.volume;
    if (step.unit === "m") return sum + step.volume / 1000;
    return sum;
  }, 0);
}
