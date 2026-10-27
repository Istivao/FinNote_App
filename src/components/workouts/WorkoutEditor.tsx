import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Plus, Save } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { GymExerciseForm } from "@/components/workouts/GymExerciseForm";
import { NewWorkoutTypeDialog } from "@/components/workouts/NewWorkoutTypeDialog";
import { RunBlockForm } from "@/components/workouts/RunBlockForm";
import {
  gymDraftsFromExercises,
  newGymExercise,
  newRunBlock,
  parseGymDrafts,
  parseRunDrafts,
  runDraftsFromBlocks,
  type GymExerciseDraft,
  type RunBlockDraft,
} from "@/lib/workout-drafts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DAYS, workoutTypeIcon } from "@/lib/workout-ui";
import { listWorkoutTypes, type WorkoutKind } from "@/lib/workout-types";
import { createWorkout, updateWorkout, type Workout, type WorkoutInput } from "@/lib/workouts";

type WorkoutEditorProps = {
  initialWorkout?: Workout;
  /** Tipo pré-selecionado ao criar um treino a partir da tela de um tipo. */
  initialTypeId?: string;
};

function initialGymDrafts(workout?: Workout): GymExerciseDraft[] {
  if (workout?.kind === "gym" && workout.exercises.length > 0) {
    return gymDraftsFromExercises(workout.exercises);
  }
  return [newGymExercise()];
}

function initialRunDrafts(workout?: Workout): RunBlockDraft[] {
  if (workout?.kind === "run" && workout.runBlocks.length > 0) {
    return runDraftsFromBlocks(workout.runBlocks);
  }
  return [newRunBlock()];
}

function workoutSnapshot(
  name: string,
  dayOfWeek: number,
  workoutTypeId: string,
  gymDrafts: GymExerciseDraft[],
  runDrafts: RunBlockDraft[],
) {
  // As chaves de rascunho são só para o React; não contam como alteração.
  const strip = <T extends { key: string }>(drafts: T[]) =>
    drafts.map(({ key: _, ...rest }) => rest);
  return JSON.stringify({
    name,
    dayOfWeek,
    workoutTypeId,
    gym: strip(gymDrafts),
    run: strip(runDrafts),
  });
}

export function WorkoutEditor({ initialWorkout, initialTypeId }: WorkoutEditorProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const navigationAllowed = useRef(false);
  const { data: workoutTypes, isPending: loadingTypes } = useQuery({
    queryKey: ["workout-types"],
    queryFn: () => listWorkoutTypes(),
  });

  const startingTypeId = initialWorkout?.workoutTypeId ?? initialTypeId ?? "";
  const [name, setName] = useState(initialWorkout?.name ?? "");
  const [dayOfWeek, setDayOfWeek] = useState(
    initialWorkout?.dayOfWeek ?? (() => new Date().getDay()),
  );
  const [workoutTypeId, setWorkoutTypeId] = useState(startingTypeId);
  const [creatingType, setCreatingType] = useState(false);
  // Os dois rascunhos ficam guardados: trocar de tipo e voltar não perde o que foi digitado.
  const [gymDrafts, setGymDrafts] = useState(() => initialGymDrafts(initialWorkout));
  const [runDrafts, setRunDrafts] = useState(() => initialRunDrafts(initialWorkout));
  const [originalSnapshot] = useState(() =>
    workoutSnapshot(
      initialWorkout?.name ?? "",
      initialWorkout?.dayOfWeek ?? new Date().getDay(),
      startingTypeId,
      gymDrafts,
      runDrafts,
    ),
  );
  const [saving, setSaving] = useState(false);

  const selectedType = workoutTypes?.find((type) => type.id === workoutTypeId);
  const kind: WorkoutKind | undefined =
    selectedType?.kind ??
    (initialWorkout && workoutTypeId === initialWorkout.workoutTypeId
      ? initialWorkout.kind
      : undefined);

  const isEditing = Boolean(initialWorkout);
  const isDirty =
    originalSnapshot !== workoutSnapshot(name, dayOfWeek, workoutTypeId, gymDrafts, runDrafts);

  useBlocker({
    shouldBlockFn: () => {
      if (navigationAllowed.current) return false;
      if (saving) return true;
      return isDirty && !window.confirm("Descartar as alterações feitas neste treino?");
    },
    enableBeforeUnload: () => (isDirty || saving) && !navigationAllowed.current,
    disabled: !isDirty && !saving,
  });

  function buildInput(): WorkoutInput | null {
    const workoutName = name.trim();
    if (!workoutName) {
      toast.error("Dê um nome ao treino.");
      return null;
    }
    if (workoutName.length > 80) {
      toast.error("O nome do treino pode ter no máximo 80 caracteres.");
      return null;
    }
    if (!selectedType) {
      toast.error("Escolha o tipo do treino.");
      return null;
    }

    if (selectedType.kind === "run") {
      const parsed = parseRunDrafts(runDrafts);
      if (!parsed.ok) {
        toast.error(parsed.error);
        return null;
      }
      return {
        name: workoutName,
        dayOfWeek,
        workoutTypeId,
        form: { kind: "run", blocks: parsed.blocks },
      };
    }

    const parsed = parseGymDrafts(gymDrafts);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return null;
    }
    return {
      name: workoutName,
      dayOfWeek,
      workoutTypeId,
      form: { kind: "gym", exercises: parsed.exercises },
    };
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = buildInput();
    if (!input) return;

    setSaving(true);
    try {
      if (initialWorkout) {
        await updateWorkout(initialWorkout.id, input);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["workouts"] }),
          queryClient.invalidateQueries({ queryKey: ["workout-types"] }),
          queryClient.invalidateQueries({ queryKey: ["workout", initialWorkout.id] }),
        ]);
      } else {
        await createWorkout(input);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["workouts"] }),
          queryClient.invalidateQueries({ queryKey: ["workout-types"] }),
        ]);
      }

      navigationAllowed.current = true;
      await router.invalidate();
      toast.success(initialWorkout ? "Treino atualizado!" : "Treino salvo!");
      if (initialWorkout) {
        await navigate({ to: "/treinos/$id", params: { id: initialWorkout.id } });
      } else {
        await navigate({ to: "/treinos/tipo/$tipoId", params: { tipoId: input.workoutTypeId } });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o treino.");
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (initialWorkout) {
      navigate({ to: "/treinos/$id", params: { id: initialWorkout.id } });
    } else if (initialTypeId) {
      navigate({ to: "/treinos/tipo/$tipoId", params: { tipoId: initialTypeId } });
    } else {
      navigate({ to: "/treinos" });
    }
  }

  return (
    <div className="min-h-screen bg-background pb-10" aria-busy={saving}>
      <header className="flex items-center gap-3 px-5 pt-6">
        <button
          type="button"
          onClick={goBack}
          disabled={saving}
          aria-label="Voltar"
          className="flex size-10 items-center justify-center rounded-full bg-surface-inactive text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <h1 className="text-lg font-black tracking-[0.15em] text-foreground">
          {isEditing ? "EDITAR TREINO" : "CRIAR TREINO"}
        </h1>
      </header>

      <form onSubmit={handleSave} className="space-y-6 px-5 pt-6">
        <fieldset disabled={saving} className="space-y-6 disabled:opacity-70">
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-muted-foreground">TIPO DE TREINO</legend>
            <div className="flex flex-wrap gap-2">
              {loadingTypes && (
                <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
              )}
              {workoutTypes?.map((type) => {
                const active = type.id === workoutTypeId;
                const Icon = workoutTypeIcon(type.name);
                return (
                  <button
                    key={type.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setWorkoutTypeId(type.id)}
                    className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-inactive text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {type.name}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCreatingType(true)}
                className="flex items-center gap-1 rounded-full border border-dashed border-border px-4 py-2 text-xs font-bold text-muted-foreground"
              >
                <Plus className="size-3.5" aria-hidden />
                Novo tipo
              </button>
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="workout-name">NOME DO TREINO</Label>
            <Input
              id="workout-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder={kind === "run" ? "Intervalado 5x1km" : "Peito e Tríceps"}
              className="h-12 rounded-xl bg-card"
            />
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-muted-foreground">
              DIA DA SEMANA QUE VAI FICAR
            </legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => {
                const active = day.index === dayOfWeek;
                return (
                  <button
                    key={day.index}
                    type="button"
                    onClick={() => setDayOfWeek(day.index)}
                    className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-inactive text-muted-foreground"
                    }`}
                  >
                    {day.short}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {kind === "gym" && <GymExerciseForm exercises={gymDrafts} onChange={setGymDrafts} />}
          {kind === "run" && <RunBlockForm blocks={runDrafts} onChange={setRunDrafts} />}
          {kind === undefined && !loadingTypes && (
            <p className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Escolha o tipo do treino para montar os exercícios.
            </p>
          )}
        </fieldset>

        <Button
          type="submit"
          disabled={saving}
          className="h-14 w-full rounded-2xl text-base font-black"
        >
          {saving ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Save className="size-5" aria-hidden />
          )}
          {isEditing ? "ATUALIZAR TREINO" : "SALVAR TREINO"}
        </Button>
      </form>

      <NewWorkoutTypeDialog
        open={creatingType}
        onOpenChange={setCreatingType}
        existingNames={workoutTypes?.map((type) => type.name) ?? []}
        onCreated={(type) => setWorkoutTypeId(type.id)}
      />
    </div>
  );
}
