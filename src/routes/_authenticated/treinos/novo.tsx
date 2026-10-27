import { createFileRoute } from "@tanstack/react-router";

import { WorkoutEditor } from "@/components/workouts/WorkoutEditor";

type NewWorkoutSearch = { tipo?: string };

export const Route = createFileRoute("/_authenticated/treinos/novo")({
  validateSearch: (search: Record<string, unknown>): NewWorkoutSearch => {
    const tipo = search["tipo"];
    return typeof tipo === "string" ? { tipo } : {};
  },
  head: () => ({
    meta: [
      { title: "Criar treino | FinNote" },
      {
        name: "description",
        content:
          "Monte um novo treino no FinNote: tipo, nome, dia da semana, exercícios, séries e repetições.",
      },
      { property: "og:title", content: "Criar treino | FinNote" },
      {
        property: "og:description",
        content: "Adicione exercícios com séries e repetições ao seu treino.",
      },
    ],
  }),
  component: NewWorkoutPage,
});

function NewWorkoutPage() {
  const { tipo } = Route.useSearch();
  return <WorkoutEditor {...(tipo ? { initialTypeId: tipo } : {})} />;
}
