import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

export const REMINDER_COLORS = ["orange", "blue", "green", "purple", "pink"] as const;

const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    if (year === undefined || month === undefined || day === undefined) return false;
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }, "Data inválida.");

export const reminderInputSchema = z.object({
  title: z.string().trim().min(1, "Informe um título.").max(80, "Use no máximo 80 caracteres."),
  description: z.string().trim().max(500, "Use no máximo 500 caracteres."),
  reminderDate: dateKeySchema,
  color: z.enum(REMINDER_COLORS),
});

export type ReminderColor = (typeof REMINDER_COLORS)[number];
export type ReminderInput = z.infer<typeof reminderInputSchema>;

export type Reminder = {
  id: string;
  title: string;
  description: string | null;
  reminderDate: string;
  color: ReminderColor;
  createdAt: string;
  updatedAt: string;
};

const reminderColumns =
  "id, title, description, reminder_date, color, created_at, updated_at" as const;

function mapReminder(reminder: {
  id: string;
  title: string;
  description: string | null;
  reminder_date: string;
  color: string;
  created_at: string;
  updated_at: string;
}): Reminder {
  return {
    id: reminder.id,
    title: reminder.title,
    description: reminder.description,
    reminderDate: reminder.reminder_date,
    color: z.enum(REMINDER_COLORS).parse(reminder.color),
    createdAt: reminder.created_at,
    updatedAt: reminder.updated_at,
  };
}

export async function listReminders(from: string, to: string) {
  const fromDate = dateKeySchema.parse(from);
  const toDate = dateKeySchema.parse(to);
  if (fromDate > toDate) throw new Error("O intervalo de datas é inválido.");

  const { data, error } = await supabase
    .from("reminders")
    .select(reminderColumns)
    .gte("reminder_date", fromDate)
    .lte("reminder_date", toDate)
    .order("reminder_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapReminder);
}

export async function createReminder(input: unknown) {
  const reminder = reminderInputSchema.parse(input);
  const { data, error } = await supabase
    .from("reminders")
    .insert({
      title: reminder.title,
      description: reminder.description || null,
      reminder_date: reminder.reminderDate,
      color: reminder.color,
    })
    .select(reminderColumns)
    .single();

  if (error) throw new Error(error.message);
  return mapReminder(data);
}

export async function updateReminder(id: string, input: unknown) {
  const reminderId = z.string().uuid().parse(id);
  const reminder = reminderInputSchema.parse(input);
  const { data, error } = await supabase
    .from("reminders")
    .update({
      title: reminder.title,
      description: reminder.description || null,
      reminder_date: reminder.reminderDate,
      color: reminder.color,
    })
    .eq("id", reminderId)
    .select(reminderColumns)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lembrete não encontrado.");
  return mapReminder(data);
}

export async function deleteReminder(id: string) {
  const reminderId = z.string().uuid().parse(id);
  const { data, error } = await supabase
    .from("reminders")
    .delete()
    .eq("id", reminderId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lembrete não encontrado.");
}
