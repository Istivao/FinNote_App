import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { WorkoutEditor } from "@/components/workouts/WorkoutEditor";
import { getWorkout } from "@/lib/workouts";

const workoutQuery = (id: string) =>
  queryOptions({
    queryKey: ["workout", id],
    queryFn: () => getWorkout(id),
  });

export const Route = createFileRoute("/_authenticated/treinos/$id/editar")({
  head: () => ({
    meta: [
      { title: "Editar treino | FinNote" },
      {
        name: "description",
        content: "Edite o nome, o dia e os exercícios de um treino cadastrado.",
      },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(workoutQuery(params.id)),
  component: EditWorkoutPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-muted-foreground">
      Não foi possível carregar o treino: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-muted-foreground">Treino não encontrado.</div>,
});

function EditWorkoutPage() {
  const { id } = Route.useParams();
  const { data: workout } = useSuspenseQuery(workoutQuery(id));

  if (!workout) {
    return <div className="p-6 text-muted-foreground">Treino não encontrado.</div>;
  }

  return <WorkoutEditor key={workout.id} initialWorkout={workout} />;
}
