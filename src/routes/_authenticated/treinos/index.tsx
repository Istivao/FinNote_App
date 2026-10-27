import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CalendarDays, Plus } from "lucide-react";

import { BottomNav } from "@/components/BottomNav";
import { NewWorkoutTypeDialog } from "@/components/workouts/NewWorkoutTypeDialog";
import { workoutTypeIcon } from "@/lib/workout-ui";
import { listWorkoutTypes } from "@/lib/workout-types";

const workoutTypesQuery = queryOptions({
  queryKey: ["workout-types"],
  queryFn: () => listWorkoutTypes(),
});

export const Route = createFileRoute("/_authenticated/treinos/")({
  head: () => ({
    meta: [
      { title: "Meus treinos | FinNote" },
      {
        name: "description",
        content: "Escolha um tipo de treino, como academia, corrida ou natação, no FinNote.",
      },
      { property: "og:title", content: "Meus treinos | FinNote" },
      { property: "og:description", content: "Treinos organizados por tipo no FinNote." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(workoutTypesQuery),
  component: WorkoutTypesPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-muted-foreground">
      Não foi possível carregar os treinos: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-muted-foreground">Nada por aqui.</div>,
});

function WorkoutTypesPage() {
  const { data: types } = useSuspenseQuery(workoutTypesQuery);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="flex items-center justify-between px-5 pt-6">
        <span className="w-10 text-xs font-black tracking-widest text-muted-foreground">FN</span>
        <h1 className="text-xl font-black tracking-[0.2em] text-foreground">TREINOS</h1>
        <Link
          to="/calendario"
          aria-label="Abrir calendário"
          className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:bg-accent"
        >
          <CalendarDays className="size-6" aria-hidden />
        </Link>
      </header>

      <section className="px-5 pt-6">
        <h2 className="text-sm font-black tracking-widest text-foreground">TIPOS DE TREINO</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {types.length === 0
            ? "Crie seu primeiro tipo para começar."
            : "Escolha um tipo para ver os treinos."}
        </p>

        <ul className="mt-5 grid grid-cols-2 gap-3">
          {types.map((type) => {
            const Icon = workoutTypeIcon(type.name);
            return (
              <li key={type.id}>
                <Link
                  to="/treinos/tipo/$tipoId"
                  params={{ tipoId: type.id }}
                  className="flex h-full flex-col gap-4 rounded-3xl border border-border bg-card p-4 transition-colors active:bg-accent"
                >
                  <span className="flex size-12 items-center justify-center rounded-full bg-surface-inactive text-primary">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold uppercase text-card-foreground">
                      {type.name}
                    </span>
                    <span className="mt-1 block text-[11px] font-semibold text-muted-foreground">
                      {type.workoutCount} {type.workoutCount === 1 ? "treino" : "treinos"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex h-full min-h-32 w-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-border p-4 text-muted-foreground transition-colors active:bg-accent"
            >
              <Plus className="size-6" aria-hidden />
              <span className="text-xs font-bold tracking-wide">NOVO TIPO</span>
            </button>
          </li>
        </ul>
      </section>

      <NewWorkoutTypeDialog
        open={creating}
        onOpenChange={setCreating}
        existingNames={types.map((type) => type.name)}
        onCreated={(type) => navigate({ to: "/treinos/tipo/$tipoId", params: { tipoId: type.id } })}
      />

      <BottomNav />
    </div>
  );
}
