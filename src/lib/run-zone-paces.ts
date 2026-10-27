import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { RUN_INTENSITIES, type RunIntensity } from "@/lib/run-blocks";

export const MIN_PACE_SEC = 120;
export const MAX_PACE_SEC = 1200;

/** Faixa de pace-alvo em segundos por km: fastSec é o limite mais rápido (menor número). */
export type ZonePace = { fastSec: number; slowSec: number };
export type ZonePaces = Partial<Record<RunIntensity, ZonePace>>;

/** Compartilhada entre o popup de zonas e o Modo Execução. */
export const zonePacesQueryKey = ["zone-paces"] as const;

const paceSecSchema = z.number().int().min(MIN_PACE_SEC).max(MAX_PACE_SEC);
const zonePaceSchema = z
  .object({ fastSec: paceSecSchema, slowSec: paceSecSchema })
  .refine((pace) => pace.fastSec < pace.slowSec, {
    message: "O pace mais rápido precisa ser menor que o mais lento.",
  });

/** "06:00" ou "6:00" → 360; null se inválido. */
export function parsePaceInput(value: string) {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** 360 → "06:00", no formato dos campos de pace. */
export function formatPaceInput(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export async function listZonePaces(): Promise<ZonePaces> {
  const { data, error } = await supabase.from("run_zone_paces").select("zone, fast_sec, slow_sec");
  if (error) throw new Error(error.message);

  const paces: ZonePaces = {};
  for (const row of data ?? []) {
    const zone = RUN_INTENSITIES.find((value) => value === row.zone);
    if (zone) paces[zone] = { fastSec: row.fast_sec, slowSec: row.slow_sec };
  }
  return paces;
}

/** Grava as zonas preenchidas e apaga as que ficaram em branco. */
export async function saveZonePaces(paces: ZonePaces) {
  const filled = RUN_INTENSITIES.flatMap((zone) => {
    const pace = paces[zone];
    return pace ? [{ zone, ...zonePaceSchema.parse(pace) }] : [];
  });
  const cleared = RUN_INTENSITIES.filter((zone) => !paces[zone]);

  if (filled.length > 0) {
    const updatedAt = new Date().toISOString();
    const { error } = await supabase.from("run_zone_paces").upsert(
      filled.map(({ zone, fastSec, slowSec }) => ({
        zone,
        fast_sec: fastSec,
        slow_sec: slowSec,
        updated_at: updatedAt,
      })),
      { onConflict: "user_id,zone" },
    );
    if (error) throw new Error(error.message);
  }

  if (cleared.length > 0) {
    const { error } = await supabase.from("run_zone_paces").delete().in("zone", cleared);
    if (error) throw new Error(error.message);
  }
}
