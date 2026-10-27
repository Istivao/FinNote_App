import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

export const TASK_PRIORITIES = ["urgent", "normal", "low"] as const;

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Informe um título.").max(80, "Use no máximo 80 caracteres."),
  description: z
    .string()
    .trim()
    .min(1, "Explique a tarefa.")
    .max(500, "Use no máximo 500 caracteres."),
  priority: z.enum(TASK_PRIORITIES),
  dueAt: z.string().datetime({ offset: true, message: "Informe uma data e horário válidos." }),
});

export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskInput = z.infer<typeof taskInputSchema>;

export type Task = {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dueAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const taskColumns =
  "id, title, description, priority, due_at, completed_at, created_at, updated_at" as const;

function mapTask(task: {
  id: string;
  title: string;
  description: string;
  priority: string;
  due_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}): Task {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: z.enum(TASK_PRIORITIES).parse(task.priority),
    dueAt: task.due_at,
    completedAt: task.completed_at,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}

export async function listTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select(taskColumns)
    .order("due_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTask);
}

export async function listOpenTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select(taskColumns)
    .is("completed_at", null)
    .order("due_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapTask);
}

export async function createTask(input: unknown) {
  const task = taskInputSchema.parse(input);
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: task.title,
      description: task.description,
      priority: task.priority,
      due_at: task.dueAt,
    })
    .select(taskColumns)
    .single();

  if (error) throw new Error(error.message);
  return mapTask(data);
}

export async function updateTask(id: string, input: unknown) {
  const taskId = z.string().uuid().parse(id);
  const task = taskInputSchema.parse(input);
  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: task.title,
      description: task.description,
      priority: task.priority,
      due_at: task.dueAt,
    })
    .eq("id", taskId)
    .select(taskColumns)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Tarefa não encontrada.");
  return mapTask(data);
}

export async function setTaskCompleted(id: string, completed: boolean) {
  const taskId = z.string().uuid().parse(id);
  const { data, error } = await supabase
    .from("tasks")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", taskId)
    .select(taskColumns)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Tarefa não encontrada.");
  return mapTask(data);
}

export async function deleteTask(id: string) {
  const taskId = z.string().uuid().parse(id);
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Tarefa não encontrada.");
}
