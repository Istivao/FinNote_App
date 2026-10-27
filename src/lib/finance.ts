import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

const MAX_MONEY_CENTS = 99_999_999_999;

export const FINANCE_DIRECTIONS = ["income", "expense"] as const;
export const FINANCE_SCHEDULE_TYPES = ["one_time", "fixed", "recurring", "installment"] as const;
export const FINANCE_STATUSES = ["pending", "settled", "cancelled"] as const;

export type FinanceDirection = (typeof FINANCE_DIRECTIONS)[number];
export type FinanceScheduleType = (typeof FINANCE_SCHEDULE_TYPES)[number];
export type FinanceStatus = (typeof FINANCE_STATUSES)[number];

export type FinanceCategoryOption = {
  value: string;
  label: string;
};

export const FINANCE_CATEGORIES = {
  income: [
    { value: "salary", label: "Salário" },
    { value: "freelance", label: "Freelance" },
    { value: "investments", label: "Investimentos" },
    { value: "sales", label: "Vendas" },
    { value: "other", label: "Outros" },
  ],
  expense: [
    { value: "housing", label: "Moradia" },
    { value: "food", label: "Alimentação" },
    { value: "transport", label: "Transporte" },
    { value: "health", label: "Saúde" },
    { value: "education", label: "Educação" },
    { value: "leisure", label: "Lazer" },
    { value: "subscriptions", label: "Assinaturas" },
    { value: "shopping", label: "Compras" },
    { value: "other", label: "Outros" },
  ],
} as const satisfies Record<FinanceDirection, readonly FinanceCategoryOption[]>;

export const FINANCE_SCHEDULE_LABELS: Record<FinanceScheduleType, string> = {
  one_time: "Avulso",
  fixed: "Fixo",
  recurring: "Recorrente",
  installment: "Parcelado",
};

function isCivilDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const civilDateSchema = z.string().refine(isCivilDate, "Informe uma data válida.");

const monthSchema = civilDateSchema.refine(
  (value) => value.endsWith("-01"),
  "Informe um mês válido.",
);

const moneySchema = z
  .number()
  .int()
  .min(1, "Informe um valor maior que zero.")
  .max(MAX_MONEY_CENTS, "O valor informado é muito alto.");

export const financeScheduleInputSchema = z
  .object({
    direction: z.enum(FINANCE_DIRECTIONS),
    scheduleType: z.enum(FINANCE_SCHEDULE_TYPES),
    title: z
      .string()
      .trim()
      .min(1, "Informe uma descrição.")
      .max(100, "Use no máximo 100 caracteres."),
    category: z.string(),
    amountCents: moneySchema,
    startsOn: civilDateSchema,
    endsOn: civilDateSchema.nullable(),
    intervalMonths: z.number().int().min(1).max(120).nullable(),
    installmentCount: z.number().int().min(2).max(600).nullable(),
    notes: z.string().trim().max(1000, "Use no máximo 1000 caracteres."),
  })
  .strict()
  .superRefine((entry, context) => {
    const allowedTypes: readonly FinanceScheduleType[] =
      entry.direction === "income"
        ? (["one_time", "recurring"] as const)
        : (["fixed", "recurring", "installment"] as const);

    if (!allowedTypes.includes(entry.scheduleType)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "O tipo não é permitido para este lançamento.",
        path: ["scheduleType"],
      });
    }

    const categories: readonly FinanceCategoryOption[] = FINANCE_CATEGORIES[entry.direction];
    const allowedCategories = categories.map((item) => item.value);
    if (!allowedCategories.includes(entry.category)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione uma categoria válida.",
        path: ["category"],
      });
    }

    if (entry.scheduleType === "recurring") {
      if (entry.intervalMonths === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe o intervalo da recorrência.",
          path: ["intervalMonths"],
        });
      }
    } else if (entry.intervalMonths !== null || entry.endsOn !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A frequência só pode ser usada em lançamentos recorrentes.",
        path: ["intervalMonths"],
      });
    }

    if (entry.endsOn !== null && entry.endsOn < entry.startsOn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A data final deve ser igual ou posterior à primeira data.",
        path: ["endsOn"],
      });
    }

    if (entry.scheduleType === "installment") {
      if (entry.installmentCount === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe a quantidade de parcelas.",
          path: ["installmentCount"],
        });
      } else if (entry.amountCents < entry.installmentCount) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "O valor total deve permitir parcelas de pelo menos R$ 0,01.",
          path: ["amountCents"],
        });
      }
    } else if (entry.installmentCount !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A quantidade de parcelas só pode ser usada em gastos parcelados.",
        path: ["installmentCount"],
      });
    }
  });

export const financeOccurrenceInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Informe uma descrição.")
      .max(100, "Use no máximo 100 caracteres."),
    category: z.string(),
    amountCents: moneySchema,
    dueOn: civilDateSchema,
    notes: z.string().trim().max(1000, "Use no máximo 1000 caracteres."),
  })
  .strict();

export type FinanceScheduleInput = z.infer<typeof financeScheduleInputSchema>;
export type FinanceOccurrenceInput = z.infer<typeof financeOccurrenceInputSchema>;

export type FinanceOccurrence = {
  id: string;
  scheduleId: string;
  direction: FinanceDirection;
  scheduleType: FinanceScheduleType;
  title: string;
  category: string;
  competenceMonth: string;
  dueOn: string;
  sequenceNumber: number;
  plannedAmountCents: number;
  actualAmountCents: number | null;
  status: FinanceStatus;
  settledAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

const timestampSchema = z.string().datetime({ offset: true });

const occurrenceRowSchema = z
  .object({
    id: z.string().uuid(),
    schedule_id: z.string().uuid(),
    direction: z.enum(FINANCE_DIRECTIONS),
    schedule_type: z.enum(FINANCE_SCHEDULE_TYPES),
    title: z.string(),
    category: z.string(),
    competence_month: monthSchema,
    due_on: civilDateSchema,
    sequence_number: z.number().int().positive(),
    planned_amount_cents: moneySchema,
    actual_amount_cents: moneySchema.nullable(),
    status: z.enum(FINANCE_STATUSES),
    settled_at: timestampSchema.nullable(),
    notes: z.string().nullable(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict();

const occurrenceColumns =
  "id, schedule_id, direction, schedule_type, title, category, competence_month, due_on, sequence_number, planned_amount_cents, actual_amount_cents, status, settled_at, notes, created_at, updated_at" as const;

function mapOccurrence(input: unknown): FinanceOccurrence {
  const occurrence = occurrenceRowSchema.parse(input);
  return {
    id: occurrence.id,
    scheduleId: occurrence.schedule_id,
    direction: occurrence.direction,
    scheduleType: occurrence.schedule_type,
    title: occurrence.title,
    category: occurrence.category,
    competenceMonth: occurrence.competence_month,
    dueOn: occurrence.due_on,
    sequenceNumber: occurrence.sequence_number,
    plannedAmountCents: occurrence.planned_amount_cents,
    actualAmountCents: occurrence.actual_amount_cents,
    status: occurrence.status,
    settledAt: occurrence.settled_at,
    notes: occurrence.notes ?? "",
    createdAt: occurrence.created_at,
    updatedAt: occurrence.updated_at,
  };
}

export function parseCurrencyToCents(value: string): number | null {
  let normalized = value
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "");
  if (!normalized) return null;

  if (normalized.includes(",")) {
    if (!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(normalized)) return null;
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "");
  } else if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const [whole = "0", decimal = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 1 && cents <= MAX_MONEY_CENTS ? cents : null;
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function formatCurrencyInput(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatCompactCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function getCurrentFinanceMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
}

export function getFinanceMonthFromDate(value: string) {
  const date = civilDateSchema.parse(value);
  return `${date.slice(0, 7)}-01`;
}

export function shiftFinanceMonth(month: string, amount: number) {
  const parsed = monthSchema.parse(month);
  const [year = 0, monthNumber = 1] = parsed.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + amount, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`;
}

export function formatFinanceMonth(month: string) {
  const parsed = monthSchema.parse(month);
  const [year = 0, monthNumber = 1] = parsed.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(year, monthNumber - 1, 1),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatFinanceDate(value: string) {
  const parsed = civilDateSchema.parse(value);
  const [year = 0, month = 1, day = 1] = parsed.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(
    new Date(year, month - 1, day),
  );
}

export function defaultDateForFinanceMonth(month: string) {
  const parsed = monthSchema.parse(month);
  const today = new Date();
  const currentMonth = getCurrentFinanceMonth();
  return currentMonth === parsed
    ? `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
    : parsed;
}

export function getFinanceCategory(direction: FinanceDirection, value: string) {
  const categories: readonly FinanceCategoryOption[] = FINANCE_CATEGORIES[direction];
  return categories.find((category) => category.value === value) ?? categories.at(-1)!;
}

export async function ensureFinanceMonth(month: string) {
  const parsedMonth = monthSchema.parse(month);
  const { data, error } = await supabase.rpc("ensure_finance_month", { p_month: parsedMonth });
  if (error) throw new Error(error.message);
  return data;
}

export async function listFinanceMonth(userId: string, month: string) {
  const parsedUserId = z.string().uuid().parse(userId);
  const parsedMonth = monthSchema.parse(month);
  await ensureFinanceMonth(parsedMonth);

  const { data, error } = await supabase
    .from("finance_occurrences")
    .select(occurrenceColumns)
    .eq("user_id", parsedUserId)
    .eq("competence_month", parsedMonth)
    .order("due_on", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapOccurrence);
}

async function getFinanceOccurrence(id: string) {
  const occurrenceId = z.string().uuid().parse(id);
  const { data, error } = await supabase
    .from("finance_occurrences")
    .select(occurrenceColumns)
    .eq("id", occurrenceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lançamento não encontrado.");
  return mapOccurrence(data);
}

export async function createFinanceSchedule(input: unknown, initiallySettled = false) {
  const entry = financeScheduleInputSchema.parse(input);
  const { data: occurrenceId, error } = await supabase.rpc("create_finance_schedule", {
    p_direction: entry.direction,
    p_schedule_type: entry.scheduleType,
    p_title: entry.title,
    p_category: entry.category,
    p_amount_cents: entry.amountCents,
    p_starts_on: entry.startsOn,
    p_ends_on: entry.scheduleType === "recurring" ? entry.endsOn : null,
    p_interval_months: entry.scheduleType === "recurring" ? entry.intervalMonths : null,
    p_installment_count: entry.scheduleType === "installment" ? entry.installmentCount : null,
    p_notes: entry.notes || null,
    p_initially_settled: initiallySettled,
  });

  if (error) throw new Error(error.message);
  if (!occurrenceId) throw new Error("O Supabase não retornou o lançamento criado.");
  return getFinanceOccurrence(occurrenceId);
}

export async function updateFinanceOccurrence(occurrence: FinanceOccurrence, input: unknown) {
  const occurrenceId = z.string().uuid().parse(occurrence.id);
  const entry = financeOccurrenceInputSchema.parse(input);
  const categories: readonly FinanceCategoryOption[] = FINANCE_CATEGORIES[occurrence.direction];
  const allowedCategories = categories.map((item) => item.value);

  if (!allowedCategories.includes(entry.category)) {
    throw new Error("Selecione uma categoria válida.");
  }

  if (getFinanceMonthFromDate(entry.dueOn) !== occurrence.competenceMonth) {
    throw new Error("O vencimento deve permanecer no mês selecionado.");
  }

  const { data: updatedId, error } = await supabase.rpc("update_finance_occurrence", {
    p_occurrence_id: occurrenceId,
    p_title: entry.title,
    p_category: entry.category,
    p_due_on: entry.dueOn,
    p_planned_amount_cents: entry.amountCents,
    p_notes: entry.notes || null,
    p_expected_updated_at: occurrence.updatedAt,
  });

  if (error) {
    throw new Error(
      error.code === "40001"
        ? "Este lançamento foi alterado em outro dispositivo. Recarregue o mês e tente novamente."
        : error.message,
    );
  }
  if (!updatedId) throw new Error("O Supabase não retornou o lançamento atualizado.");
  return getFinanceOccurrence(updatedId);
}

export async function setFinanceOccurrenceSettled(occurrence: FinanceOccurrence, settled: boolean) {
  const occurrenceId = z.string().uuid().parse(occurrence.id);
  const { data: updatedId, error } = await supabase.rpc("set_finance_occurrence_settled", {
    p_occurrence_id: occurrenceId,
    p_settled: settled,
    p_expected_updated_at: occurrence.updatedAt,
  });

  if (error) {
    throw new Error(
      error.code === "40001"
        ? "Este lançamento foi alterado em outro dispositivo. Recarregue o mês e tente novamente."
        : error.message,
    );
  }
  if (!updatedId) throw new Error("O Supabase não retornou o lançamento atualizado.");
  return getFinanceOccurrence(updatedId);
}

export async function deleteFinanceSchedule(id: string) {
  const scheduleId = z.string().uuid().parse(id);
  const { data, error } = await supabase
    .from("finance_schedules")
    .delete()
    .eq("id", scheduleId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lançamento não encontrado.");
}

export type FinanceSummary = {
  plannedIncomeCents: number;
  plannedExpenseCents: number;
  plannedBalanceCents: number;
  settledIncomeCents: number;
  settledExpenseCents: number;
  settledBalanceCents: number;
};

export function summarizeFinance(occurrences: FinanceOccurrence[]): FinanceSummary {
  const summary = {
    plannedIncomeCents: 0,
    plannedExpenseCents: 0,
    settledIncomeCents: 0,
    settledExpenseCents: 0,
  };

  for (const occurrence of occurrences) {
    if (occurrence.status === "cancelled") continue;
    if (occurrence.direction === "income") {
      summary.plannedIncomeCents += occurrence.plannedAmountCents;
      if (occurrence.status === "settled") {
        summary.settledIncomeCents += occurrence.actualAmountCents ?? 0;
      }
    } else {
      summary.plannedExpenseCents += occurrence.plannedAmountCents;
      if (occurrence.status === "settled") {
        summary.settledExpenseCents += occurrence.actualAmountCents ?? 0;
      }
    }
  }

  return {
    ...summary,
    plannedBalanceCents: summary.plannedIncomeCents - summary.plannedExpenseCents,
    settledBalanceCents: summary.settledIncomeCents - summary.settledExpenseCents,
  };
}

export function buildFinanceWeeklyData(occurrences: FinanceOccurrence[]) {
  const weeks = Array.from({ length: 5 }, (_, index) => ({
    week: `Sem ${index + 1}`,
    income: 0,
    expense: 0,
  }));

  for (const occurrence of occurrences) {
    if (occurrence.status === "cancelled") continue;
    const day = Number(occurrence.dueOn.slice(8, 10));
    const index = Math.min(4, Math.floor((day - 1) / 7));
    const week = weeks[index];
    if (week) week[occurrence.direction] += occurrence.plannedAmountCents;
  }

  return weeks;
}

export function buildExpenseCategoryData(occurrences: FinanceOccurrence[]) {
  const totals = new Map<string, number>();
  for (const occurrence of occurrences) {
    if (occurrence.direction !== "expense" || occurrence.status === "cancelled") continue;
    totals.set(
      occurrence.category,
      (totals.get(occurrence.category) ?? 0) + occurrence.plannedAmountCents,
    );
  }

  return Array.from(totals, ([category, value]) => ({
    category,
    label: getFinanceCategory("expense", category).label,
    value,
  })).sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}
