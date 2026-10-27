import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Check, Circle, FileText, ListChecks, NotebookPen, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Note } from "@/lib/notes";
import { listNotes } from "@/lib/notes";
import { cn } from "@/lib/utils";

const notesQuery = queryOptions({
  queryKey: ["notes"],
  queryFn: listNotes,
});

export const Route = createFileRoute("/_authenticated/notas/")({
  head: () => ({
    meta: [
      { title: "Notas | FinNote" },
      {
        name: "description",
        content: "Guarde textos, ideias e listas no FinNote.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(notesQuery),
  component: NotesPage,
  errorComponent: ({ error }) => (
    <main className="min-h-dvh bg-background px-5 py-10" role="alert">
      <div className="mx-auto max-w-lg rounded-3xl border border-destructive/30 bg-destructive/10 p-6 text-center">
        <p className="font-bold text-foreground">Não foi possível carregar suas notas.</p>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button asChild variant="outline" className="mt-5">
          <Link to="/">Voltar para a Home</Link>
        </Button>
      </div>
    </main>
  ),
});

function updatedLabel(updatedAt: string) {
  return formatDistanceToNow(new Date(updatedAt), {
    addSuffix: true,
    locale: ptBR,
  });
}

function TextNotePreview({ note }: { note: Extract<Note, { kind: "text" }> }) {
  return (
    <p className="mt-5 line-clamp-4 whitespace-pre-line text-sm leading-6 text-muted-foreground">
      {note.body}
    </p>
  );
}

function ListNotePreview({ note }: { note: Extract<Note, { kind: "list" }> }) {
  const checkedCount = note.items.filter((item) => item.isChecked).length;
  const percentage = note.items.length === 0 ? 0 : (checkedCount / note.items.length) * 100;

  return (
    <div className="mt-5">
      <ul className="space-y-2.5">
        {note.items.slice(0, 3).map((item) => (
          <li key={item.id} className="flex min-w-0 items-center gap-2.5 text-sm">
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-md border",
                item.isChecked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-foreground/20 text-transparent",
              )}
              aria-hidden
            >
              <Check className="size-3.5" />
            </span>
            <span
              className={cn(
                "truncate text-card-foreground",
                item.isChecked && "text-muted-foreground line-through",
              )}
            >
              <span className="sr-only">{item.isChecked ? "Marcado: " : "Não marcado: "}</span>
              {item.content}
            </span>
          </li>
        ))}
      </ul>

      {note.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Lista sem itens.</p>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-3 text-[11px] font-bold text-muted-foreground">
        <span>
          {checkedCount} de {note.items.length} marcados
        </span>
        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-background/70" aria-hidden>
          <span
            className="block h-full rounded-full bg-primary"
            style={{ width: `${percentage}%` }}
          />
        </span>
      </div>
    </div>
  );
}

function NoteCard({ note }: { note: Note }) {
  const isText = note.kind === "text";
  const Icon = isText ? FileText : ListChecks;

  return (
    <li>
      <Link
        to="/notas/$id"
        params={{ id: note.id }}
        className="group relative flex h-full min-h-64 flex-col overflow-hidden rounded-[2rem] border border-border bg-card p-5 shadow-lg transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:translate-y-0"
      >
        <span
          className={cn("absolute inset-x-0 top-0 h-1", isText ? "bg-primary" : "bg-cyan-400")}
          aria-hidden
        />

        <span className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-2xl",
              isText ? "bg-primary/15 text-primary" : "bg-cyan-400/15 text-cyan-300",
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              {isText ? "Texto" : "Lista"}
            </span>
            <span className="mt-1 block truncate text-lg font-black text-card-foreground">
              {note.title}
            </span>
          </span>
        </span>

        <span className="flex-1">
          {note.kind === "text" ? <TextNotePreview note={note} /> : <ListNotePreview note={note} />}
        </span>

        <span className="mt-5 block border-t border-border pt-3 text-[11px] text-muted-foreground">
          Atualizada {updatedLabel(note.updatedAt)}
        </span>
      </Link>
    </li>
  );
}

function NotesPage() {
  const { data: notes } = useSuspenseQuery(notesQuery);
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  return (
    <main className="relative min-h-dvh bg-background pb-32" aria-label="Notas">
      <header className="mx-auto grid max-w-5xl grid-cols-[2.5rem_1fr_2.5rem] items-center gap-3 px-5 pb-6 pt-6 sm:px-6">
        <Link
          to="/"
          aria-label="Voltar para a Home"
          className="flex size-10 items-center justify-center rounded-full bg-surface-inactive text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-black tracking-[0.32em] text-primary">FINNOTE</p>
          <h1 className="truncate text-xl font-black tracking-[0.2em] text-foreground">NOTAS</h1>
        </div>
        <span className="flex size-10 items-center justify-center text-primary" aria-hidden>
          <NotebookPen className="size-6" />
        </span>
      </header>

      <section className="mx-auto max-w-5xl px-5 sm:px-6" aria-labelledby="notes-heading">
        <div className="overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-card to-secondary p-6 shadow-xl sm:p-8">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
                Seu bloco pessoal
              </p>
              <h2
                id="notes-heading"
                className="mt-2 text-2xl font-black text-foreground sm:text-3xl"
              >
                Guarde o que importa.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Ideias rápidas, textos e listas ficam organizados em um só lugar.
              </p>
            </div>
            <span className="hidden size-16 shrink-0 items-center justify-center rounded-3xl border border-primary/20 bg-primary/10 text-primary sm:flex">
              <NotebookPen className="size-8" aria-hidden />
            </span>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs font-bold text-muted-foreground">
            {notes.length > 0 ? (
              <FileText className="size-4 text-primary" aria-hidden />
            ) : (
              <Circle className="size-3 text-primary" aria-hidden />
            )}
            {notes.length} {notes.length === 1 ? "nota salva" : "notas salvas"}
          </div>
        </div>

        {notes.length > 0 ? (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </ul>
        ) : (
          <div className="mt-6 rounded-[2rem] border border-dashed border-border bg-card/40 px-6 py-14 text-center">
            <span className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
              <NotebookPen className="size-8" aria-hidden />
            </span>
            <h2 className="mt-5 text-lg font-black text-foreground">Seu bloco está em branco</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Crie uma nota de texto para registrar uma ideia ou uma lista para organizar suas
              compras.
            </p>
            <Button
              type="button"
              className="mt-6 h-11 rounded-xl px-5 font-bold"
              onClick={() => setTypePickerOpen(true)}
            >
              <Plus className="size-4" aria-hidden />
              Criar primeira nota
            </Button>
          </div>
        )}
      </section>

      <button
        type="button"
        aria-label="Criar nota"
        onClick={() => setTypePickerOpen(true)}
        className="fixed right-5 z-30 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background active:scale-95"
        style={{
          bottom: "calc(1.5rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))",
        }}
      >
        <Plus className="size-8" aria-hidden />
      </button>

      <Dialog open={typePickerOpen} onOpenChange={setTypePickerOpen}>
        <DialogContent className="w-[calc(100%-2rem)] rounded-[2rem] border-border bg-card sm:max-w-lg">
          <DialogHeader className="pr-6 text-left">
            <DialogTitle className="text-xl font-black text-foreground">
              O que você vai criar?
            </DialogTitle>
            <DialogDescription>
              Escolha o formato da nova nota. O tipo não muda depois.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <Link
              to="/notas/novo"
              search={{ tipo: "texto" }}
              className="group rounded-3xl border border-border bg-background/50 p-5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <FileText className="size-6" aria-hidden />
              </span>
              <span className="mt-4 block text-base font-black text-foreground">Texto</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Para ideias, anotações e textos corridos.
              </span>
            </Link>

            <Link
              to="/notas/novo"
              search={{ tipo: "lista" }}
              className="group rounded-3xl border border-border bg-background/50 p-5 text-left transition-colors hover:border-cyan-300/50 hover:bg-cyan-300/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300">
                <ListChecks className="size-6" aria-hidden />
              </span>
              <span className="mt-4 block text-base font-black text-foreground">Lista</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Para compras e itens que podem ser marcados.
              </span>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
