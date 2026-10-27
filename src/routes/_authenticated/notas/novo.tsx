import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { NoteEditor } from "@/components/notes/NoteEditor";

const newNoteSearchSchema = z.object({
  tipo: z.enum(["texto", "lista"]).optional().default("texto"),
});

export const Route = createFileRoute("/_authenticated/notas/novo")({
  validateSearch: (search) => newNoteSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Nova nota | FinNote" },
      {
        name: "description",
        content: "Crie uma nova nota de texto ou lista no FinNote.",
      },
    ],
  }),
  component: NewNotePage,
});

function NewNotePage() {
  const { tipo } = Route.useSearch();
  return <NoteEditor kind={tipo === "lista" ? "list" : "text"} />;
}
