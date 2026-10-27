import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { NoteEditor } from "@/components/notes/NoteEditor";
import { Button } from "@/components/ui/button";
import { getNote } from "@/lib/notes";

const noteQuery = (id: string) =>
  queryOptions({
    queryKey: ["note", id],
    queryFn: async () => {
      const note = await getNote(id);
      if (!note) throw new Error("Nota não encontrada.");
      return note;
    },
  });

export const Route = createFileRoute("/_authenticated/notas/$id")({
  head: () => ({
    meta: [
      { title: "Editar nota | FinNote" },
      {
        name: "description",
        content: "Consulte e edite uma nota salva no FinNote.",
      },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(noteQuery(params.id)),
  component: EditNotePage,
  errorComponent: ({ error }) => (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5" role="alert">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 text-center">
        <p className="font-black text-foreground">Não foi possível abrir esta nota.</p>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button asChild variant="outline" className="mt-5">
          <Link to="/notas">Voltar para notas</Link>
        </Button>
      </div>
    </main>
  ),
});

function EditNotePage() {
  const { id } = Route.useParams();
  const { data: note } = useSuspenseQuery(noteQuery(id));
  return <NoteEditor kind={note.kind} initialNote={note} />;
}
