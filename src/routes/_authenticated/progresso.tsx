import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { BottomNav } from "@/components/BottomNav";
import { DAYS } from "@/lib/workout-ui";
import { listWorkouts } from "@/lib/workouts";

const workoutsQuery = queryOptions({
  queryKey: ["workouts"],
  queryFn: () => listWorkouts(),
});

export const Route = createFileRoute("/_authenticated/progresso")({
  head: () => ({
    meta: [
      { title: "Progresso | FinNote" },
      {
        name: "description",
        content:
          "Acompanhe quantos treinos e exercícios você tem cadastrados em cada dia da semana.",
      },
      { property: "og:title", content: "Progresso | FinNote" },
      { property: "og:description", content: "Resumo dos seus treinos por dia da semana." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(workoutsQuery),
  component: ProgressPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-muted-foreground">
      Não foi possível carregar o progresso: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-muted-foreground">Nada por aqui.</div>,
});

function ProgressPage() {
  const { data: workouts } = useSuspenseQuery(workoutsQuery);
  const totalExercises = workouts.reduce((acc, w) => acc + w.exerciseCount, 0);

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="px-5 pt-6">
        <h1 className="text-xl font-black tracking-[0.2em] text-foreground">PROGRESSO</h1>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 px-5">
        <div className="rounded-3xl border border-border bg-card p-4">
          <p className="text-3xl font-black text-primary">{workouts.length}</p>
          <p className="text-xs text-muted-foreground">treinos cadastrados</p>
        </div>
        <div className="rounded-3xl border border-border bg-card p-4">
          <p className="text-3xl font-black text-primary">{totalExercises}</p>
          <p className="text-xs text-muted-foreground">exercícios no total</p>
        </div>
      </div>

      <ul className="mt-6 space-y-2 px-5">
        {DAYS.map((day) => {
          const count = workouts.filter((w) => w.dayOfWeek === day.index).length;
          return (
            <li
              key={day.index}
              className="flex items-center justify-between rounded-2xl bg-surface-inactive px-4 py-3"
            >
              <span className="text-xs font-bold tracking-widest text-foreground">{day.full}</span>
              <span className="text-xs font-semibold text-muted-foreground">
                {count} {count === 1 ? "treino" : "treinos"}
              </span>
            </li>
          );
        })}
      </ul>

      <BottomNav />
    </div>
  );
}
