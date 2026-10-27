import { useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileText, ListChecks, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createNote,
  deleteNote,
  noteInputSchema,
  updateNote,
  type Note,
  type NoteInput,
  type NoteKind,
} from "@/lib/notes";
import { cn } from "@/lib/utils";

type NoteEditorProps = {
  kind: NoteKind;
  initialNote?: Note;
};

type ItemDraft = {
  key: string;
  content: string;
  isChecked: boolean;
};

function newItem(content = "", isChecked = false): ItemDraft {
  return { key: crypto.randomUUID(), content, isChecked };
}

function initialItems(kind: NoteKind, note?: Note) {
  if (kind === "list" && note?.kind === "list") {
    return note.items.map((item) => ({
      key: item.id,
      content: item.content,
      isChecked: item.isChecked,
    }));
  }

  return kind === "list" ? [newItem()] : [];
}

function noteSnapshot(kind: NoteKind, title: string, body: string, items: ItemDraft[]) {
  if (kind === "text") return JSON.stringify({ title, body });
  return JSON.stringify({
    title,
    items: items
      .filter((item) => item.content.length > 0 || item.isChecked)
      .map(({ content, isChecked }) => ({ content, isChecked })),
  });
}

export function NoteEditor({ kind, initialNote }: NoteEditorProps) {
  if (initialNote && initialNote.kind !== kind) {
    throw new Error("O tipo da nota não corresponde ao editor.");
  }

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const navigationAllowed = useRef(false);

  const [title, setTitle] = useState(initialNote?.title ?? "");
  const [body, setBody] = useState(initialNote?.kind === "text" ? initialNote.body : "");
  const [items, setItems] = useState<ItemDraft[]>(() => initialItems(kind, initialNote));
  const [expectedUpdatedAt] = useState(initialNote?.updatedAt ?? null);
  const [originalSnapshot] = useState(() =>
    noteSnapshot(
      kind,
      initialNote?.title ?? "",
      initialNote?.kind === "text" ? initialNote.body : "",
      initialItems(kind, initialNote),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const currentSnapshot = noteSnapshot(kind, title, body, items);
  const isDirty = originalSnapshot !== currentSnapshot;

  useBlocker({
    shouldBlockFn: () => {
      if (navigationAllowed.current) return false;
      if (saving || deleting) return true;
      return isDirty && !window.confirm("Descartar as alterações feitas nesta nota?");
    },
    enableBeforeUnload: () => (isDirty || saving || deleting) && !navigationAllowed.current,
    disabled: !isDirty && !saving && !deleting,
  });

  const isText = kind === "text";
  const checkedCount = items.filter((item) => item.isChecked && item.content.trim()).length;

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function focusItem(key: string) {
    window.requestAnimationFrame(() => inputRefs.current.get(key)?.focus());
  }

  function addItem(afterKey?: string) {
    if (items.length >= 200) {
      toast.error("Uma lista pode ter no máximo 200 itens.");
      return;
    }

    const item = newItem();
    setItems((current) => {
      if (!afterKey) return [...current, item];
      const index = current.findIndex((currentItem) => currentItem.key === afterKey);
      if (index < 0) return [...current, item];
      return [...current.slice(0, index + 1), item, ...current.slice(index + 1)];
    });
    focusItem(item.key);
  }

  function removeItem(key: string) {
    setItems((current) => {
      const index = current.findIndex((item) => item.key === key);
      if (index < 0) return current;

      if (current.length === 1) {
        const replacement = newItem();
        focusItem(replacement.key);
        return [replacement];
      }

      const nextItems = current.filter((item) => item.key !== key);
      const itemToFocus = nextItems[Math.min(index, nextItems.length - 1)];
      if (itemToFocus) focusItem(itemToFocus.key);
      return nextItems;
    });
  }

  function handleItemKeyDown(event: KeyboardEvent<HTMLInputElement>, key: string) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addItem(key);
  }

  function buildInput(): NoteInput | null {
    const input = isText
      ? { kind: "text" as const, title, body }
      : {
          kind: "list" as const,
          title,
          items: items.map((item) => ({
            content: item.content,
            isChecked: item.isChecked,
          })),
        };
    const parsed = noteInputSchema.safeParse(input);

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Confira os dados da nota.");
      return null;
    }

    return parsed.data;
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = buildInput();
    if (!input) return;

    setSaving(true);
    setFormError(null);
    try {
      if (initialNote) {
        if (!expectedUpdatedAt) throw new Error("Não foi possível validar a versão desta nota.");
        await updateNote(initialNote.id, input, expectedUpdatedAt);
      } else {
        await createNote(input);
      }

      queryClient.removeQueries({ queryKey: ["notes"] });
      if (initialNote) {
        queryClient.removeQueries({ queryKey: ["note", initialNote.id] });
      }

      navigationAllowed.current = true;
      toast.success(initialNote ? "Nota atualizada." : "Nota criada.");
      await navigate({ to: "/notas" });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar a nota.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialNote) return;
    setDeleting(true);
    try {
      await deleteNote(initialNote.id);
      queryClient.removeQueries({ queryKey: ["note", initialNote.id] });
      queryClient.removeQueries({ queryKey: ["notes"] });
      navigationAllowed.current = true;
      toast.success("Nota excluída.");
      await navigate({ to: "/notas" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a nota.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background" aria-busy={saving || deleting}>
      <header className="mx-auto grid max-w-3xl grid-cols-[2.5rem_1fr_2.5rem] items-center gap-3 px-5 pb-5 pt-6 sm:px-6">
        <button
          type="button"
          onClick={() => navigate({ to: "/notas" })}
          disabled={saving || deleting}
          aria-label="Voltar para notas"
          className="flex size-10 items-center justify-center rounded-full bg-surface-inactive text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-black tracking-[0.28em] text-primary">
            {initialNote ? "EDITAR" : "NOVA NOTA"}
          </p>
          <h1 className="truncate text-lg font-black tracking-[0.12em] text-foreground">
            {isText ? "TEXTO" : "LISTA"}
          </h1>
        </div>
        {initialNote ? (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            disabled={saving || deleting}
            aria-label="Excluir nota"
            className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:pointer-events-none disabled:opacity-50"
          >
            <Trash2 className="size-5" aria-hidden />
          </button>
        ) : (
          <span className="size-10" aria-hidden />
        )}
      </header>

      <form id="note-editor-form" onSubmit={handleSave}>
        <div className="mx-auto max-w-3xl px-5 pb-36 sm:px-6">
          <section className="relative overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl">
            <span
              className={cn("absolute inset-x-0 top-0 h-1", isText ? "bg-primary" : "bg-cyan-400")}
              aria-hidden
            />

            <div className="p-5 sm:p-7">
              <div className="flex items-center justify-between gap-4">
                <span
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em]",
                    isText ? "bg-primary/15 text-primary" : "bg-cyan-400/15 text-cyan-300",
                  )}
                >
                  {isText ? (
                    <FileText className="size-3.5" aria-hidden />
                  ) : (
                    <ListChecks className="size-3.5" aria-hidden />
                  )}
                  {isText ? "Nota de texto" : "Lista marcável"}
                </span>
                <span className="text-[11px] text-muted-foreground">{title.length}/80</span>
              </div>

              <div className="mt-6">
                <Label htmlFor="note-title" className="sr-only">
                  Título da nota
                </Label>
                <Input
                  id="note-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={80}
                  placeholder={isText ? "Título da sua ideia" : "Ex.: Lista de mercado"}
                  autoFocus={!initialNote}
                  disabled={saving || deleting}
                  className="h-auto border-0 bg-transparent px-0 py-2 text-2xl font-black text-foreground shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0 sm:text-3xl"
                />
              </div>

              <div className="my-5 h-px bg-border" aria-hidden />

              {isText ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <Label
                      htmlFor="note-body"
                      className="text-xs font-black uppercase tracking-widest"
                    >
                      Conteúdo
                    </Label>
                    <span className="text-[11px] text-muted-foreground">{body.length}/20.000</span>
                  </div>
                  <Textarea
                    id="note-body"
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    maxLength={20_000}
                    placeholder="Escreva sua ideia, pensamento ou anotação..."
                    disabled={saving || deleting}
                    className="min-h-[48dvh] resize-none border-0 bg-transparent px-0 py-0 text-base leading-7 text-foreground shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
                  />
                </div>
              ) : (
                <div>
                  <div className="mb-4 flex items-end justify-between gap-4">
                    <div>
                      <h2 className="text-xs font-black uppercase tracking-widest text-foreground">
                        Itens
                      </h2>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Pressione Enter para criar o próximo item.
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
                      {checkedCount}/{items.filter((item) => item.content.trim()).length} marcados
                    </span>
                  </div>

                  <ul className="space-y-2.5">
                    {items.map((item, index) => (
                      <li
                        key={item.key}
                        className="group flex items-center gap-3 rounded-2xl border border-border bg-background/40 p-3 transition-colors focus-within:border-primary/40"
                      >
                        <Checkbox
                          checked={item.isChecked}
                          onCheckedChange={(checked) =>
                            updateItem(item.key, { isChecked: checked === true })
                          }
                          disabled={saving || deleting}
                          aria-label={`Marcar item ${index + 1}`}
                          className="size-6 rounded-lg"
                        />
                        <Input
                          ref={(element) => {
                            if (element) inputRefs.current.set(item.key, element);
                            else inputRefs.current.delete(item.key);
                          }}
                          value={item.content}
                          onChange={(event) =>
                            updateItem(item.key, { content: event.target.value })
                          }
                          onKeyDown={(event) => handleItemKeyDown(event, item.key)}
                          maxLength={300}
                          placeholder={`Item ${index + 1}`}
                          aria-label={`Conteúdo do item ${index + 1}`}
                          disabled={saving || deleting}
                          className={cn(
                            "h-10 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0",
                            item.isChecked && "text-muted-foreground line-through",
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => removeItem(item.key)}
                          disabled={saving || deleting}
                          aria-label={`Remover item ${index + 1}`}
                          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:pointer-events-none disabled:opacity-50"
                        >
                          <X className="size-4" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => addItem()}
                    disabled={saving || deleting || items.length >= 200}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-4 text-sm font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Plus className="size-4" aria-hidden />
                    Adicionar item
                  </button>
                </div>
              )}

              {formError ? (
                <p
                  role="alert"
                  className="mt-5 rounded-2xl bg-destructive/15 px-4 py-3 text-sm text-destructive"
                >
                  {formError}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        <footer
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-5 pt-3 backdrop-blur sm:px-6"
          style={{
            paddingBottom:
              "calc(0.75rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))",
          }}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-4">
            <span className="min-w-0 flex-1 text-xs text-muted-foreground" aria-live="polite">
              {isDirty ? "Alterações ainda não salvas" : "Nenhuma alteração pendente"}
            </span>
            <Button
              type="submit"
              disabled={saving || deleting || !isDirty}
              className="h-12 min-w-36 rounded-2xl px-6 font-black"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </footer>
      </form>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleting) setDeleteOpen(open);
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-3xl border-border bg-card sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta nota?</AlertDialogTitle>
            <AlertDialogDescription>
              “{initialNote?.title}” e todo o seu conteúdo serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
