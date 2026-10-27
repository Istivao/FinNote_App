import {
  MAX_RUN_SETS,
  MAX_RUN_VOLUME,
  type RunBlock,
  type RunIntensity,
  type RunUnit,
} from "@/lib/run-blocks";
import { CATEGORIES, type ExerciseCategory } from "@/lib/workout-ui";
import { MAX_REPS, MAX_SETS, type WorkoutExercise, type WorkoutInput } from "@/lib/workouts";

/** Converte um campo digitado ("1,5") em número; vazio vira 0. */
export function toDraftNumber(value: string) {
  return Number(value.trim().replace(",", "."));
}

// --- Academia -------------------------------------------------------------------

/** Campos do formulário ficam em texto enquanto o usuário digita. */
export type GymExerciseDraft = {
  key: string;
  id?: string;
  name: string;
  sets: string;
  reps: string;
  category: ExerciseCategory;
  restMinutes: string;
  weightKg: string;
};

type GymExercisesInput = Extract<WorkoutInput["form"], { kind: "gym" }>["exercises"];

export function newGymExercise(category: ExerciseCategory = "exercicios"): GymExerciseDraft {
  return {
    key: crypto.randomUUID(),
    name: "",
    sets: "4",
    reps: "12",
    category,
    restMinutes: "1",
    weightKg: "",
  };
}

export function gymDraftsFromExercises(exercises: WorkoutExercise[]): GymExerciseDraft[] {
  return exercises.map((exercise) => ({
    key: exercise.id,
    id: exercise.id,
    name: exercise.name,
    sets: String(exercise.sets),
    reps: String(exercise.reps),
    category: exercise.category,
    restMinutes: String(exercise.restMinutes),
    weightKg: exercise.weightKg === null ? "" : String(exercise.weightKg),
  }));
}

/** Valida os rascunhos e devolve os exercícios na ordem das categorias. */
export function parseGymDrafts(
  drafts: GymExerciseDraft[],
): { ok: true; exercises: GymExercisesInput } | { ok: false; error: string } {
  if (drafts.length === 0) return { ok: false, error: "Adicione ao menos um exercício." };

  const ordered = CATEGORIES.flatMap((category) =>
    drafts.filter((draft) => draft.category === category.value),
  );
  const exercises: GymExercisesInput = [];

  for (const [index, draft] of ordered.entries()) {
    const position = index + 1;
    const name = draft.name.trim();
    const sets = toDraftNumber(draft.sets);
    const reps = toDraftNumber(draft.reps);
    const restMinutes = toDraftNumber(draft.restMinutes);
    const weightKg = draft.weightKg.trim() === "" ? 0 : toDraftNumber(draft.weightKg);

    if (!name || name.length > 80) {
      return { ok: false, error: `Dê um nome (até 80 letras) ao exercício ${position}.` };
    }
    if (!Number.isInteger(sets) || sets < 1 || sets > MAX_SETS) {
      return { ok: false, error: `Informe de 1 a ${MAX_SETS} séries no exercício ${position}.` };
    }
    if (!Number.isInteger(reps) || reps < 1 || reps > MAX_REPS) {
      return {
        ok: false,
        error: `Informe as repetições (número inteiro) do exercício ${position}.`,
      };
    }
    if (!Number.isFinite(restMinutes) || restMinutes < 0 || restMinutes > 30) {
      return {
        ok: false,
        error: `Informe um descanso entre 0 e 30 minutos no exercício ${position}.`,
      };
    }
    if (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > 999) {
      return { ok: false, error: `Informe um peso entre 0 e 999 kg no exercício ${position}.` };
    }

    exercises.push({
      ...(draft.id ? { id: draft.id } : {}),
      name,
      sets,
      reps,
      category: draft.category,
      restMinutes,
      weightKg: weightKg > 0 ? weightKg : null,
    });
  }

  return { ok: true, exercises };
}

// --- Corrida --------------------------------------------------------------------

/** Campos numéricos ficam em texto enquanto o usuário digita. */
export type RunBlockDraft = {
  key: string;
  sets: string;
  intensity: RunIntensity;
  volume: string;
  volumeUnit: RunUnit;
  /** Vazio = sem recuperação. */
  recoveryIntensity: RunIntensity | "";
  recoveryVolume: string;
  recoveryUnit: RunUnit;
};

export function newRunBlock(): RunBlockDraft {
  return {
    key: crypto.randomUUID(),
    sets: "1",
    intensity: "Z2",
    volume: "",
    volumeUnit: "km",
    recoveryIntensity: "",
    recoveryVolume: "",
    recoveryUnit: "m",
  };
}

export function runDraftsFromBlocks(blocks: RunBlock[]): RunBlockDraft[] {
  return blocks.map((block) => ({
    key: crypto.randomUUID(),
    sets: String(block.sets),
    intensity: block.intensity,
    volume: String(block.volume),
    volumeUnit: block.volumeUnit,
    recoveryIntensity: block.recovery?.intensity ?? "",
    recoveryVolume: block.recovery ? String(block.recovery.volume) : "",
    recoveryUnit: block.recovery?.unit ?? "m",
  }));
}

function isValidVolume(volume: number) {
  return Number.isFinite(volume) && volume > 0 && volume <= MAX_RUN_VOLUME;
}

/** Valida os rascunhos; a recuperação só vale para blocos com mais de 1 série. */
export function parseRunDrafts(
  drafts: RunBlockDraft[],
): { ok: true; blocks: RunBlock[] } | { ok: false; error: string } {
  if (drafts.length === 0) return { ok: false, error: "Adicione ao menos um bloco." };

  const blocks: RunBlock[] = [];
  for (const [index, draft] of drafts.entries()) {
    const position = index + 1;
    const sets = toDraftNumber(draft.sets);
    const volume = toDraftNumber(draft.volume);

    if (!Number.isInteger(sets) || sets < 1 || sets > MAX_RUN_SETS) {
      return { ok: false, error: `Informe de 1 a ${MAX_RUN_SETS} séries no bloco ${position}.` };
    }
    if (!isValidVolume(volume)) {
      return { ok: false, error: `Informe o volume ativo do bloco ${position}.` };
    }

    let recovery: RunBlock["recovery"] = null;
    if (sets > 1 && draft.recoveryIntensity !== "") {
      const recoveryVolume = toDraftNumber(draft.recoveryVolume);
      if (!isValidVolume(recoveryVolume)) {
        return { ok: false, error: `Informe o volume da recuperação do bloco ${position}.` };
      }
      recovery = {
        intensity: draft.recoveryIntensity,
        volume: recoveryVolume,
        unit: draft.recoveryUnit,
      };
    }

    blocks.push({
      sets,
      intensity: draft.intensity,
      volume,
      volumeUnit: draft.volumeUnit,
      recovery,
    });
  }

  return { ok: true, blocks };
}
