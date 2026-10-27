import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

import {
  buildExpenseCategoryData,
  buildFinanceWeeklyData,
  financeScheduleInputSchema,
  formatCurrency,
  formatCurrencyInput,
  getFinanceMonthFromDate,
  parseCurrencyToCents,
  shiftFinanceMonth,
  summarizeFinance,
  type FinanceOccurrence,
} from "@/lib/finance";

function occurrence(overrides: Partial<FinanceOccurrence> = {}): FinanceOccurrence {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    scheduleId: "00000000-0000-4000-8000-000000000002",
    direction: "expense",
    scheduleType: "fixed",
    title: "Aluguel",
    category: "housing",
    competenceMonth: "2026-09-01",
    dueOn: "2026-09-10",
    sequenceNumber: 1,
    plannedAmountCents: 100_000,
    actualAmountCents: null,
    status: "pending",
    settledAt: null,
    notes: "",
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

const fixedExpense = {
  direction: "expense",
  scheduleType: "fixed",
  title: "Aluguel",
  category: "housing",
  amountCents: 150_000,
  startsOn: "2026-09-10",
  endsOn: null,
  intervalMonths: null,
  installmentCount: null,
  notes: "",
} as const;

describe("parseCurrencyToCents", () => {
  it("parses Brazilian, plain and decimal point values without floating point math", () => {
    expect(parseCurrencyToCents("R$ 1.234,56")).toBe(123_456);
    expect(parseCurrencyToCents("1234,56")).toBe(123_456);
    expect(parseCurrencyToCents("1234.56")).toBe(123_456);
    expect(parseCurrencyToCents("1.234")).toBe(123_400);
    expect(parseCurrencyToCents("0,01")).toBe(1);
  });

  it("rejects empty, zero and malformed values", () => {
    expect(parseCurrencyToCents("")).toBeNull();
    expect(parseCurrencyToCents("0,00")).toBeNull();
    expect(parseCurrencyToCents("12,345")).toBeNull();
    expect(parseCurrencyToCents("abc")).toBeNull();
  });

  it("round-trips the maximum supported business value without losing cents", () => {
    const cents = 99_999_999_999;
    expect(parseCurrencyToCents(formatCurrencyInput(cents))).toBe(cents);
    expect(parseCurrencyToCents("1.000.000.000,00")).toBeNull();
  });
});

describe("financeScheduleInputSchema", () => {
  it("accepts fixed expenses and recurring income", () => {
    expect(financeScheduleInputSchema.safeParse(fixedExpense).success).toBe(true);
    expect(
      financeScheduleInputSchema.safeParse({
        ...fixedExpense,
        direction: "income",
        scheduleType: "recurring",
        category: "salary",
        intervalMonths: 1,
        endsOn: "2027-09-10",
      }).success,
    ).toBe(true);
  });

  it("rejects unsupported direction/type/category combinations", () => {
    expect(
      financeScheduleInputSchema.safeParse({
        ...fixedExpense,
        scheduleType: "one_time",
      }).success,
    ).toBe(false);
    expect(
      financeScheduleInputSchema.safeParse({
        ...fixedExpense,
        category: "salary",
      }).success,
    ).toBe(false);
  });

  it("validates installment count, total and recurring end date", () => {
    expect(
      financeScheduleInputSchema.safeParse({
        ...fixedExpense,
        scheduleType: "installment",
        amountCents: 2,
        installmentCount: 3,
      }).success,
    ).toBe(false);
    expect(
      financeScheduleInputSchema.safeParse({
        ...fixedExpense,
        scheduleType: "recurring",
        intervalMonths: 2,
        endsOn: "2026-08-01",
      }).success,
    ).toBe(false);
  });
});

describe("finance month helpers", () => {
  it("normalizes dates and shifts months across years", () => {
    expect(getFinanceMonthFromDate("2026-09-23")).toBe("2026-09-01");
    expect(shiftFinanceMonth("2026-01-01", -1)).toBe("2025-12-01");
    expect(shiftFinanceMonth("2026-12-01", 1)).toBe("2027-01-01");
  });

  it("formats cents as Brazilian reais", () => {
    expect(formatCurrency(123_456)).toMatch(/1\.234,56/);
  });
});

describe("finance aggregations", () => {
  const occurrences = [
    occurrence({
      id: "00000000-0000-4000-8000-000000000011",
      direction: "income",
      scheduleType: "one_time",
      category: "sales",
      plannedAmountCents: 100_000,
      actualAmountCents: 90_000,
      status: "settled",
      settledAt: "2026-09-02T12:00:00.000Z",
      dueOn: "2026-09-01",
    }),
    occurrence({
      id: "00000000-0000-4000-8000-000000000012",
      plannedAmountCents: 50_000,
      actualAmountCents: 50_000,
      status: "settled",
      settledAt: "2026-09-10T12:00:00.000Z",
      dueOn: "2026-09-08",
    }),
    occurrence({
      id: "00000000-0000-4000-8000-000000000013",
      scheduleId: "00000000-0000-4000-8000-000000000003",
      category: "food",
      title: "Mercado",
      plannedAmountCents: 30_000,
      dueOn: "2026-09-29",
    }),
    occurrence({
      id: "00000000-0000-4000-8000-000000000014",
      scheduleId: "00000000-0000-4000-8000-000000000004",
      plannedAmountCents: 999_999,
      status: "cancelled",
    }),
  ];

  it("separates planned and settled balances and ignores cancelled rows", () => {
    expect(summarizeFinance(occurrences)).toEqual({
      plannedIncomeCents: 100_000,
      plannedExpenseCents: 80_000,
      plannedBalanceCents: 20_000,
      settledIncomeCents: 90_000,
      settledExpenseCents: 50_000,
      settledBalanceCents: 40_000,
    });
  });

  it("groups monthly flow into five calendar ranges", () => {
    expect(buildFinanceWeeklyData(occurrences)).toEqual([
      { week: "Sem 1", income: 100_000, expense: 0 },
      { week: "Sem 2", income: 0, expense: 50_000 },
      { week: "Sem 3", income: 0, expense: 0 },
      { week: "Sem 4", income: 0, expense: 0 },
      { week: "Sem 5", income: 0, expense: 30_000 },
    ]);
  });

  it("groups and orders expenses by category", () => {
    expect(buildExpenseCategoryData(occurrences)).toEqual([
      { category: "housing", label: "Moradia", value: 50_000 },
      { category: "food", label: "Alimentação", value: 30_000 },
    ]);
  });
});
