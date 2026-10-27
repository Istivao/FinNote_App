import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

const workoutTypeNameSchema = z.string().trim().min(1).max(40);

/** Formulário usado pelo tipo: Academia (exercícios) ou Corrida (blocos). */
export const WORKOUT_KINDS = [
  { value: "gym", label: "Academia" },
  { value: "run", label: "Corrida" },
] as const;

export type WorkoutKind = (typeof WORKOUT_KINDS)[number]["value"];

const workoutKindSchema = z.enum(["gym", "run"]);

export type WorkoutType = {
  id: string;
  name: string;
  kind: WorkoutKind;
  workoutCount: number;
};

export async function listWorkoutTypes(): Promise<WorkoutType[]> {
  const { data, error } = await supabase
    .from("workout_types")
    .select("id, name, kind, created_at, workouts(count)")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((type) => ({
    id: type.id,
    name: type.name,
    kind: workoutKindSchema.parse(type.kind),
    workoutCount: (type.workouts as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

export async function createWorkoutType(name: string, kind: WorkoutKind): Promise<WorkoutType> {
  const typeName = workoutTypeNameSchema.parse(name);
  const typeKind = workoutKindSchema.parse(kind);
  const { data, error } = await supabase
    .from("workout_types")
    .insert({ name: typeName, kind: typeKind })
    .select("id, name, kind")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error(`Você já tem o tipo "${typeName}".`);
    throw new Error(error.message);
  }

  return {
    id: data.id,
    name: data.name,
    kind: workoutKindSchema.parse(data.kind),
    workoutCount: 0,
  };
}

export async function deleteWorkoutType(id: string) {
  const typeId = z.string().uuid().parse(id);
  const { data, error } = await supabase
    .from("workout_types")
    .delete()
    .eq("id", typeId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23503") {
      throw new Error("Exclua ou mova os treinos deste tipo antes de excluí-lo.");
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error("Tipo de treino não encontrado.");
}
