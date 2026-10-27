import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export const NOTE_KINDS = ["text", "list"] as const;

const titleSchema = z
  .string()
  .trim()
  .min(1, "Informe um título.")
  .max(80, "Use no máximo 80 caracteres no título.");

export const noteItemInputSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Preencha todos os itens da lista.")
    .max(300, "Use no máximo 300 caracteres por item."),
  isChecked: z.boolean(),
});

export const noteInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    title: titleSchema,
    body: z
      .string()
      .trim()
      .min(1, "Escreva o conteúdo da nota.")
      .max(20_000, "Use no máximo 20.000 caracteres."),
  }),
  z.object({
    kind: z.literal("list"),
    title: titleSchema,
    items: z
      .array(noteItemInputSchema)
      .min(1, "Adicione pelo menos um item à lista.")
      .max(200, "Uma lista pode ter no máximo 200 itens."),
  }),
]);

export type NoteKind = (typeof NOTE_KINDS)[number];
export type NoteInput = z.infer<typeof noteInputSchema>;

export type NoteItem = {
  id: string;
  content: string;
  isChecked: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
};

type NoteBase = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type TextNote = NoteBase & {
  kind: "text";
  body: string;
  items: [];
};

export type ListNote = NoteBase & {
  kind: "list";
  body: null;
  items: NoteItem[];
};

export type Note = TextNote | ListNote;

const noteRowSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(NOTE_KINDS),
  title: z.string(),
  body: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  note_items: z.array(
    z.object({
      id: z.string().uuid(),
      content: z.string(),
      is_checked: z.boolean(),
      position: z.number().int(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  ),
});

const noteColumns =
  "id, kind, title, body, created_at, updated_at, note_items(id, content, is_checked, position, created_at, updated_at)" as const;

function mapNote(input: unknown): Note {
  const note = noteRowSchema.parse(input);
  const base = {
    id: note.id,
    title: note.title,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
  };

  if (note.kind === "text") {
    if (note.body === null) throw new Error("A nota de texto está sem conteúdo.");
    return { ...base, kind: "text", body: note.body, items: [] };
  }

  return {
    ...base,
    kind: "list",
    body: null,
    items: note.note_items
      .map((item) => ({
        id: item.id,
        content: item.content,
        isChecked: item.is_checked,
        position: item.position,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }))
      .sort((a, b) => a.position - b.position),
  };
}

function toItemsJson(note: NoteInput): Json {
  if (note.kind === "text") return [];
  return note.items.map((item) => ({
    content: item.content,
    is_checked: item.isChecked,
  }));
}

export async function listNotes() {
  const { data, error } = await supabase
    .from("notes")
    .select(noteColumns)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapNote);
}

export async function getNote(id: string) {
  const noteId = z.string().uuid().parse(id);
  const { data, error } = await supabase
    .from("notes")
    .select(noteColumns)
    .eq("id", noteId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapNote(data) : null;
}

export async function createNote(input: unknown) {
  const note = noteInputSchema.parse(input);
  const { data, error } = await supabase.rpc("create_note", {
    p_kind: note.kind,
    p_title: note.title,
    p_body: note.kind === "text" ? note.body : null,
    p_items: toItemsJson(note),
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Não foi possível identificar a nota criada.");
  return data;
}

export async function updateNote(id: string, input: unknown, expectedUpdatedAt: string) {
  const noteId = z.string().uuid().parse(id);
  const note = noteInputSchema.parse(input);
  const expectedTimestamp = z.string().min(1).parse(expectedUpdatedAt);
  const { data: currentNote, error: currentNoteError } = await supabase
    .from("notes")
    .select("updated_at")
    .eq("id", noteId)
    .maybeSingle();

  if (currentNoteError) throw new Error(currentNoteError.message);
  if (!currentNote) throw new Error("Nota não encontrada.");
  if (currentNote.updated_at !== expectedTimestamp) {
    throw new Error("Esta nota foi alterada em outro dispositivo. Abra novamente antes de salvar.");
  }

  const { data, error } = await supabase.rpc("update_note", {
    p_id: noteId,
    p_title: note.title,
    p_body: note.kind === "text" ? note.body : null,
    p_items: toItemsJson(note),
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nota não encontrada.");
  return data;
}

export async function deleteNote(id: string) {
  const noteId = z.string().uuid().parse(id);
  const { data, error } = await supabase
    .from("notes")
    .delete()
    .eq("id", noteId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nota não encontrada.");
}
