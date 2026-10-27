import type { TaskPriority } from "@/lib/tasks";

export const TASK_PRIORITY_DETAILS: Record<
  TaskPriority,
  { label: string; reminder: string; badgeClass: string }
> = {
  urgent: {
    label: "Urgente",
    reminder: "Aviso diário às 9h",
    badgeClass: "border-red-400/30 bg-red-400/10 text-red-300",
  },
  normal: {
    label: "Normal",
    reminder: "Aviso a cada 2 dias às 9h",
    badgeClass: "border-primary/30 bg-primary/10 text-primary",
  },
  low: {
    label: "Baixa",
    reminder: "Aviso a cada 3 dias às 9h",
    badgeClass: "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",
  },
};

export function taskDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function taskTimeInputValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function taskDeadlineIso(dateValue: string, timeValue: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue);
  if (!dateMatch || !timeMatch) return null;

  const [, yearValue, monthValue, dayValue] = dateMatch;
  const [, hourValue, minuteValue] = timeMatch;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return date.toISOString();
}

export function formatTaskDeadline(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
