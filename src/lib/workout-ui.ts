import {
  Activity,
  Bike,
  Dumbbell,
  Footprints,
  HeartPulse,
  PersonStanding,
  Swords,
  Waves,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const DAYS = [
  { index: 1, short: "SEG", full: "SEGUNDA-FEIRA" },
  { index: 2, short: "TER", full: "TERÇA-FEIRA" },
  { index: 3, short: "QUA", full: "QUARTA-FEIRA" },
  { index: 4, short: "QUI", full: "QUINTA-FEIRA" },
  { index: 5, short: "SEX", full: "SEXTA-FEIRA" },
  { index: 6, short: "SÁB", full: "SÁBADO" },
  { index: 0, short: "DOM", full: "DOMINGO" },
] as const;

/** Segundos em "mm:ss". */
export function formatTime(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function dayLabel(index: number, kind: "short" | "full" = "full") {
  return DAYS.find((d) => d.index === index)?.[kind] ?? "";
}

export function workoutIcon(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (/(perna|quadr|glute|panturr|leg)/.test(n)) return Footprints;
  if (/(cardio|corrida|aerob|hiit)/.test(n)) return HeartPulse;
  if (/(costas|dorsal|puxada|remada)/.test(n)) return PersonStanding;
  if (/(biceps|bíceps|triceps|tríceps|braço|ombro)/.test(n)) return Zap;
  return Dumbbell;
}

export function workoutTypeIcon(name: string): LucideIcon {
  const n = name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (/(academia|muscula|gym|peso)/.test(n)) return Dumbbell;
  if (/(corrida|caminhada|trilha|run)/.test(n)) return Footprints;
  if (/(natacao|nado|piscina|aqua|swim)/.test(n)) return Waves;
  if (/(ciclismo|bike|bicicleta|pedal|spinning)/.test(n)) return Bike;
  if (/(luta|box|muay|jiu|judo|karate|mma)/.test(n)) return Swords;
  if (/(yoga|pilates|alonga|mobilidade)/.test(n)) return PersonStanding;
  if (/(funcional|crossfit|hiit)/.test(n)) return Zap;
  if (/(cardio|aerob)/.test(n)) return HeartPulse;
  return Activity;
}

export const CATEGORIES = [
  { value: "alongamentos", label: "ALONGAMENTOS" },
  { value: "exercicios", label: "EXERCÍCIOS" },
  { value: "cardio", label: "CARDIO" },
] as const;

export type ExerciseCategory = (typeof CATEGORIES)[number]["value"];

export function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? "EXERCÍCIOS";
}
