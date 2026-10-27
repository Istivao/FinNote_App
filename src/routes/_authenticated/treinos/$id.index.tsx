import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { buildRunSteps, describeRunBlock } from "@/lib/run-blocks";
import { CATEGORIES, dayLabel, workoutIcon, workoutTypeIcon } from "@/lib/workout-ui";
import { deleteWorkout, getWorkout } from "@/lib/workouts";

const workoutQuery = (id: string) =>
  queryOptions({
    queryKey: ["workout", id],
    queryFn: () => getWorkout(id),
  });

export const Route = createFileRoute("/_authenticated/treinos/$id/")({
  head: () => ({
    meta: [
      { title: "Detalhes do treino | FinNote" },
      {
        name: "description",
        content: "Veja os exercícios, séries e repetições deste treino cadastrado no FinNote.",
      },
      { property: "og:title", content: "Detalhes do treino | FinNote" },
      { property: "og:description", content: "Exercícios, séries e repetições do seu treino." },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(workoutQuery(params.id)),
  component: WorkoutDetail,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-muted-foreground">
      Não foi possível carregar o treino: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-muted-foreground">Treino não encontrado.</div>,
});

function WorkoutDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: workout } = useSuspenseQuery(workoutQuery(id));

  if (!workout) {
    return <div className="p-6 text-muted-foreground">Treino não encontrado.</div>;
  }

  const Icon =
    workout.kind === "run" ? workoutTypeIcon(workout.workoutTypeName) : workoutIcon(workout.name);
  const typePage = {
    to: "/treinos/tipo/$tipoId",
    params: { tipoId: workout.workoutTypeId },
  } as const;

  async function handleDelete() {
    try {
      await deleteWorkout(id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workouts"] }),
        queryClient.invalidateQueries({ queryKey: ["workout-types"] }),
      ]);
      toast.success("Treino excluído.");
      navigate(typePage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir.");
    }
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="flex items-center gap-3 px-5 pt-6">
        <button
          type="button"
          onClick={() => navigate(typePage)}
          aria-label="Voltar"
          className="flex size-10 items-center justify-center rounded-full bg-surface-inactive text-foreground"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-black uppercase tracking-[0.1em] text-foreground">
          {workout.name}
        </h1>
        <button
          type="button"
          onClick={() => navigate({ to: "/treinos/$id/editar", params: { id } })}
          aria-label={`Editar treino ${workout.name}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-inactive text-foreground"
        >
          <Pencil className="size-5" aria-hidden />
        </button>
      </header>

      <div className="mt-6 flex items-center gap-4 px-5">
        <span className="flex size-14 items-center justify-center rounded-full bg-card text-primary">
          <Icon className="size-7" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-bold text-foreground">
            {workout.workoutTypeName} · {dayLabel(workout.dayOfWeek)}
          </p>
          <p className="text-xs text-muted-foreground">
            {workout.kind === "run"
              ? `${workout.runBlocks.length} ${workout.runBlocks.length === 1 ? "bloco" : "blocos"} · ${buildRunSteps(workout.runBlocks).length} etapas`
              : `${workout.exercises.length} exercícios`}
          </p>
        </div>
      </div>

      <div className="mt-6 px-5">
        <Button
          type="button"
          onClick={() => navigate({ to: "/treinos/$id/executar", params: { id } })}
          className="h-14 w-full rounded-2xl text-base font-black tracking-[0.1em]"
        >
          <Play className="size-5" aria-hidden />
          INICIAR TREINO
        </Button>
      </div>

      {workout.kind === "run" && (
        <section className="mt-6 space-y-3 px-5">
          <h2 className="text-sm font-black tracking-[0.15em] text-primary">BLOCOS</h2>
          <ul className="space-y-3">
            {workout.runBlocks.map((block, index) => (
              <li
                key={index}
                className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4"
              >
                <span className="text-base font-black text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold text-card-foreground">
                  {describeRunBlock(block)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 space-y-6 px-5">
        {CATEGORIES.map((category) => {
          const items = workout.exercises.filter((e) => e.category === category.value);
          if (items.length === 0) return null;
          return (
            <section key={category.value} className="space-y-3">
              <h2 className="text-sm font-black tracking-[0.15em] text-primary">
                {category.label}
              </h2>
              <ul className="space-y-3">
                {items.map((exercise, index) => (
                  <li
                    key={exercise.id}
                    className="flex items-center justify-between rounded-3xl border border-border bg-card p-4"
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-base font-black text-primary">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm font-semibold text-card-foreground">
                        {exercise.name}
                      </span>
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {exercise.sets} × {exercise.reps}
                      {exercise.weightKg !== null && ` · ${exercise.weightKg} kg`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="px-5 pt-8">
        <Button
          type="button"
          variant="outline"
          onClick={handleDelete}
          className="h-12 w-full rounded-2xl border-destructive text-destructive"
        >
          <Trash2 className="size-4" aria-hidden />
          Excluir treino
        </Button>
      </div>
    </div>
  );
}
