import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ChevronRight, Clock, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { BottomNav } from "@/components/BottomNav";
import { ZoneImageButton } from "@/components/workouts/ZoneImageButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DAYS, dayLabel, workoutIcon, workoutTypeIcon } from "@/lib/workout-ui";
import { deleteWorkoutType, listWorkoutTypes } from "@/lib/workout-types";
import { listWorkouts } from "@/lib/workouts";

const workoutTypesQuery = queryOptions({
  queryKey: ["workout-types"],
  queryFn: () => listWorkoutTypes(),
});

const workoutsQuery = queryOptions({
  queryKey: ["workouts"],
  queryFn: () => listWorkouts(),
});

export const Route = createFileRoute("/_authenticated/treinos/tipo/$tipoId")({
  head: () => ({
    meta: [
      { title: "Treinos | FinNote" },
      { name: "description", content: "Treinos cadastrados neste tipo no FinNote." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(workoutTypesQuery),
      context.queryClient.ensureQueryData(workoutsQuery),
    ]),
  component: WorkoutTypePage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-muted-foreground">
      Não foi possível carregar os treinos: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-muted-foreground">Nada por aqui.</div>,
});

// Ordem de exibição dos dias: segunda a domingo, como nas abas do app.
const DAY_ORDER: number[] = DAYS.map((day) => day.index);

function WorkoutTypePage() {
  const { tipoId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: types } = useSuspenseQuery(workoutTypesQuery);
  const { data: workouts } = useSuspenseQuery(workoutsQuery);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const type = types.find((t) => t.id === tipoId);
  if (!type) {
    return (
      <div className="p-6 text-muted-foreground">
        Tipo de treino não encontrado.{" "}
        <Link to="/treinos" className="text-primary underline">
          Voltar
        </Link>
      </div>
    );
  }

  const today = new Date().getDay();
  const typeWorkouts = workouts
    .filter((workout) => workout.workoutTypeId === type.id)
    .sort((a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek));
  const TypeIcon = workoutTypeIcon(type.name);

  async function handleDeleteType() {
    setDeleting(true);
    try {
      await deleteWorkoutType(tipoId);
      await queryClient.invalidateQueries({ queryKey: ["workout-types"] });
      toast.success("Tipo excluído.");
      await navigate({ to: "/treinos" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o tipo.");
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="flex items-center gap-3 px-5 pt-6">
        <button
          type="button"
          onClick={() => navigate({ to: "/treinos" })}
          aria-label="Voltar"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-inactive text-foreground"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <h1 className="flex min-w-0 flex-1 items-center gap-2 text-lg font-black uppercase tracking-[0.1em] text-foreground">
          <TypeIcon className="size-5 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{type.name}</span>
        </h1>
        {type.kind === "run" && <ZoneImageButton />}
        {typeWorkouts.length === 0 && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label={`Excluir tipo ${type.name}`}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-inactive text-destructive"
          >
            <Trash2 className="size-5" aria-hidden />
          </button>
        )}
      </header>

      <section className="px-5 pt-6">
        <p className="text-xs text-muted-foreground">
          {typeWorkouts.length}{" "}
          {typeWorkouts.length === 1 ? "treino cadastrado" : "treinos cadastrados"}
        </p>

        <ul className="mt-5 space-y-3">
          {typeWorkouts.map((workout) => {
            const Icon = workout.kind === "run" ? TypeIcon : workoutIcon(workout.name);
            const isToday = workout.dayOfWeek === today;
            return (
              <li key={workout.id}>
                <Link
                  to="/treinos/$id"
                  params={{ id: workout.id }}
                  className="flex items-center gap-4 rounded-3xl border border-border bg-card p-4 transition-colors active:bg-accent"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-inactive text-primary">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold uppercase text-card-foreground">
                      {workout.name}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-2">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ${
                          isToday
                            ? "bg-primary text-primary-foreground"
                            : "bg-surface-inactive text-muted-foreground"
                        }`}
                      >
                        {isToday ? "HOJE" : dayLabel(workout.dayOfWeek, "short")}
                      </span>
                      <span className="inline-flex rounded-full bg-surface-inactive px-3 py-1 text-[11px] font-semibold text-muted-foreground">
                        {workout.kind === "run"
                          ? `${workout.blockCount} ${workout.blockCount === 1 ? "bloco" : "blocos"}`
                          : `${workout.exerciseCount} exercícios`}
                      </span>
                    </span>
                    <span className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden />
                      Aproximadamente {workout.estimatedMinutes} min
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>

        {typeWorkouts.length === 0 && (
          <p className="mt-10 rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nenhum treino de {type.name.toLowerCase()} ainda. Toque no + para criar.
          </p>
        )}
      </section>

      <Link
        to="/treinos/novo"
        search={{ tipo: type.id }}
        aria-label={`Criar treino de ${type.name}`}
        className="fixed bottom-24 right-5 z-30 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform active:scale-95"
      >
        <Plus className="size-8" aria-hidden />
      </Link>

      <AlertDialog
        open={confirmingDelete}
        onOpenChange={(open) => !deleting && setConfirmingDelete(open)}
      >
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o tipo "{type.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Ele não tem treinos cadastrados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteType();
              }}
              className="bg-destructive text-destructive-foreground"
            >
              {deleting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BottomNav />
    </div>
  );
}
