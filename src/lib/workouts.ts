import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { estimateRunMinutes, runBlockSchema, type RunBlock } from "@/lib/run-blocks";
import type { WorkoutKind } from "@/lib/workout-types";

export const MAX_SETS = 20;
export const MAX_REPS = 999;

/** Exercício do formulário de Academia. */
const exerciseSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  sets: z.number().int().min(1).max(MAX_SETS),
  reps: z.number().int().min(1).max(MAX_REPS),
  category: z.enum(["alongamentos", "exercicios", "cardio"]),
  restMinutes: z.number().min(0).max(30).default(1),
  weightKg: z.number().gt(0).max(999).nullable().default(null),
});

/** O conteúdo do treino depende do formulário do tipo escolhido. */
const workoutFormSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("gym"),
    exercises: z
      .array(exerciseSchema)
      .min(1)
      .max(40)
      .refine(
        (exercises) => {
          const ids = exercises.flatMap((exercise) =>
            exercise.id === undefined ? [] : [exercise.id.toLowerCase()],
          );
          return new Set(ids).size === ids.length;
        },
        { message: "Os IDs dos exercícios não podem se repetir." },
      ),
  }),
  z.object({
    kind: z.literal("run"),
    blocks: z.array(runBlockSchema).min(1).max(20),
  }),
]);

const workoutSchema = z.object({
  name: z.string().trim().min(1).max(80),
  dayOfWeek: z.number().int().min(0).max(6),
  workoutTypeId: z.string().uuid(),
  form: workoutFormSchema,
});

export type WorkoutInput = z.input<typeof workoutSchema>;
export type ExerciseCategory = z.infer<typeof exerciseSchema>["category"];
export type WorkoutExercise = {
  id: string;
  name: string;
  sets: number;
  reps: number;
  category: ExerciseCategory;
  restMinutes: number;
  weightKg: number | null;
};
export type Workout = {
  id: string;
  name: string;
  dayOfWeek: number;
  workoutTypeId: string;
  workoutTypeName: string;
  kind: WorkoutKind;
  exercises: WorkoutExercise[];
  runBlocks: RunBlock[];
};

type RunBlockRow = {
  order_index: number;
  sets: number;
  intensity: string;
  volume: number | string;
  volume_unit: string;
  recovery_intensity: string | null;
  recovery_volume: number | string | null;
  recovery_unit: string | null;
};

const RUN_BLOCK_COLUMNS =
  "order_index, sets, intensity, volume, volume_unit, recovery_intensity, recovery_volume, recovery_unit";

function toRunBlocks(rows: RunBlockRow[]): RunBlock[] {
  return [...rows]
    .sort((a, b) => a.order_index - b.order_index)
    .map((row) =>
      runBlockSchema.parse({
        sets: row.sets,
        intensity: row.intensity,
        volume: Number(row.volume),
        volumeUnit: row.volume_unit,
        recovery:
          row.recovery_intensity === null
            ? null
            : {
                intensity: row.recovery_intensity,
                volume: Number(row.recovery_volume),
                unit: row.recovery_unit,
              },
      }),
    );
}

function kindOf(type: unknown): WorkoutKind {
  return (type as { kind?: string } | null)?.kind === "run" ? "run" : "gym";
}

export async function listWorkouts() {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      `id, name, day_of_week, workout_type_id, created_at, workout_types(kind), exercises(id, sets), run_blocks(${RUN_BLOCK_COLUMNS})`,
    )
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((workout) => {
    const kind = kindOf(workout.workout_types);
    const exercises = (workout.exercises ?? []) as { id: string; sets: number }[];
    const runBlocks = toRunBlocks((workout.run_blocks ?? []) as RunBlockRow[]);
    const totalSets = exercises.reduce((total, exercise) => total + (exercise.sets || 3), 0);

    return {
      id: workout.id,
      name: workout.name,
      dayOfWeek: workout.day_of_week,
      workoutTypeId: workout.workout_type_id,
      kind,
      exerciseCount: exercises.length,
      blockCount: runBlocks.length,
      estimatedMinutes:
        kind === "run"
          ? estimateRunMinutes(runBlocks)
          : Math.max(10, Math.round((totalSets * 2.5) / 5) * 5),
    };
  });
}

export async function getWorkout(id: string): Promise<Workout | null> {
  const workoutId = z.string().uuid().parse(id);
  const { data: workout, error } = await supabase
    .from("workouts")
    .select(
      `id, name, day_of_week, workout_type_id, workout_types(name, kind), exercises(id, name, sets, reps, category, rest_minutes, weight_kg, order_index), run_blocks(${RUN_BLOCK_COLUMNS})`,
    )
    .eq("id", workoutId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!workout) return null;

  const exercises = (
    (workout.exercises ?? []) as {
      id: string;
      name: string;
      sets: number;
      reps: number;
      category: string;
      rest_minutes: number | string | null;
      weight_kg: number | string | null;
      order_index: number;
    }[]
  ).sort((a, b) => a.order_index - b.order_index);

  return {
    id: workout.id,
    name: workout.name,
    dayOfWeek: workout.day_of_week,
    workoutTypeId: workout.workout_type_id,
    workoutTypeName: (workout.workout_types as { name: string } | null)?.name ?? "",
    kind: kindOf(workout.workout_types),
    exercises: exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      category: exerciseSchema.shape.category.parse(exercise.category ?? "exercicios"),
      restMinutes: Number(exercise.rest_minutes ?? 1) || 0,
      weightKg: Number(exercise.weight_kg) > 0 ? Number(exercise.weight_kg) : null,
    })),
    runBlocks: toRunBlocks((workout.run_blocks ?? []) as RunBlockRow[]),
  };
}

/** Converte o formulário no par de payloads (exercícios ou blocos) aceito pelas RPCs. */
function formPayload(form: z.infer<typeof workoutFormSchema>, includeIds: boolean) {
  if (form.kind === "run") {
    return {
      p_exercises: null,
      p_run_blocks: form.blocks.map((block) => ({
        sets: block.sets,
        intensity: block.intensity,
        volume: block.volume,
        volume_unit: block.volumeUnit,
        recovery_intensity: block.recovery?.intensity ?? null,
        recovery_volume: block.recovery?.volume ?? null,
        recovery_unit: block.recovery?.unit ?? null,
      })),
    };
  }

  return {
    p_run_blocks: null,
    p_exercises: form.exercises.map((exercise) => ({
      ...(includeIds && exercise.id !== undefined ? { id: exercise.id } : {}),
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      category: exercise.category,
      rest_minutes: exercise.restMinutes,
      weight_kg: exercise.weightKg,
    })),
  };
}

export async function createWorkout(input: WorkoutInput) {
  const workout = workoutSchema.parse(input);
  const { data: workoutId, error } = await supabase.rpc("create_workout_with_exercises", {
    p_name: workout.name,
    p_day_of_week: workout.dayOfWeek,
    p_workout_type_id: workout.workoutTypeId,
    ...formPayload(workout.form, false),
  });

  if (error) throw new Error(error.message);
  if (!workoutId) throw new Error("O Supabase não retornou o treino criado.");

  return { id: workoutId };
}

export async function updateWorkout(id: string, input: WorkoutInput): Promise<string> {
  const workoutId = z.string().uuid().parse(id);
  const workout = workoutSchema.parse(input);
  const { data: updatedWorkoutId, error } = await supabase.rpc("update_workout_with_exercises", {
    p_id: workoutId,
    p_name: workout.name,
    p_day_of_week: workout.dayOfWeek,
    p_workout_type_id: workout.workoutTypeId,
    ...formPayload(workout.form, true),
  });

  if (error) throw new Error(error.message);
  if (!updatedWorkoutId) throw new Error("O Supabase não retornou o treino atualizado.");

  return updatedWorkoutId;
}

export async function deleteWorkout(id: string) {
  const workoutId = z.string().uuid().parse(id);
  const { data, error } = await supabase
    .from("workouts")
    .delete()
    .eq("id", workoutId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Treino não encontrado.");

  return { ok: true } as const;
}
