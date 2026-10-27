import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Loader2,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { FinanceEntryDialog } from "@/components/finance/FinanceEntryDialog";
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
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildExpenseCategoryData,
  buildFinanceWeeklyData,
  deleteFinanceSchedule,
  FINANCE_CATEGORIES,
  FINANCE_SCHEDULE_LABELS,
  formatCompactCurrency,
  formatCurrency,
  formatFinanceDate,
  formatFinanceMonth,
  getCurrentFinanceMonth,
  getFinanceCategory,
  listFinanceMonth,
  setFinanceOccurrenceSettled,
  shiftFinanceMonth,
  summarizeFinance,
  type FinanceOccurrence,
} from "@/lib/finance";
import { cn } from "@/lib/utils";

const financeMonthQuery = (userId: string, month: string) =>
  queryOptions({
    queryKey: ["finance", userId, "month", month],
    queryFn: () => listFinanceMonth(userId, month),
    staleTime: 30_000,
  });

const flowChartConfig = {
  income: { label: "Ganhos", color: "var(--color-chart-2)" },
  expense: { label: "Gastos", color: "var(--color-chart-1)" },
} satisfies ChartConfig;

const categoryColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-4)",
  "#fb7185",
  "#a78bfa",
  "#60a5fa",
  "#34d399",
  "#f472b6",
  "var(--color-chart-5)",
];

const categoryChartConfig = Object.fromEntries(
  FINANCE_CATEGORIES.expense.map((category, index) => [
    category.value,
    { label: category.label, color: categoryColors[index] },
  ]),
) as ChartConfig;

const categoryColorByValue = Object.fromEntries(
  FINANCE_CATEGORIES.expense.map((category, index) => [category.value, categoryColors[index]]),
) as Record<string, string>;

export const Route = createFileRoute("/_authenticated/financas")({
  head: () => ({
    meta: [
      { title: "Finanças | FinNote" },
      {
        name: "description",
        content: "Acompanhe ganhos, gastos e o saldo de cada mês.",
      },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      financeMonthQuery(context.user.id, getCurrentFinanceMonth()),
    ),
  component: FinancesPage,
  errorComponent: ({ error }) => (
    <main className="min-h-dvh bg-background px-5 py-10" role="alert">
      <div className="mx-auto max-w-lg rounded-3xl border border-destructive/30 bg-card p-6">
        <h1 className="text-lg font-black text-foreground">
          Não foi possível carregar as finanças
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button asChild variant="outline" className="mt-5 rounded-xl">
          <Link to="/">Voltar para a Home</Link>
        </Button>
      </div>
    </main>
  ),
});

type FinanceFilter = "all" | "income" | "expense";

function balanceColor(value: number) {
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-red-300";
  return "text-foreground";
}

function FinanceFlowChart({ occurrences }: { occurrences: FinanceOccurrence[] }) {
  const data = buildFinanceWeeklyData(occurrences);
  const hasValues = data.some((week) => week.income > 0 || week.expense > 0);

  return (
    <article className="rounded-[2rem] border border-border bg-card p-5 shadow-lg sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
            Fluxo previsto
          </p>
          <h2 className="mt-1 text-lg font-black text-foreground">Ganhos e gastos</h2>
        </div>
        <span className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <TrendingUp className="size-5" aria-hidden />
        </span>
      </div>

      {hasValues ? (
        <ChartContainer config={flowChartConfig} className="mt-5 h-60 w-full aspect-auto">
          <BarChart data={data} margin={{ left: -10, right: 4, top: 8 }} accessibilityLayer>
            <CartesianGrid vertical={false} strokeDasharray="4 4" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={10} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              width={66}
              tickFormatter={(value) => formatCompactCurrency(Number(value))}
            />
            <ChartTooltip
              cursor={{ fill: "var(--color-muted)", opacity: 0.35 }}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name) => (
                    <div className="flex min-w-36 items-center justify-between gap-5">
                      <span className="text-muted-foreground">
                        {name === "income" ? "Ganhos" : "Gastos"}
                      </span>
                      <span className="font-black tabular-nums text-foreground">
                        {formatCurrency(Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="income" fill="var(--color-income)" radius={[6, 6, 2, 2]} />
            <Bar dataKey="expense" fill="var(--color-expense)" radius={[6, 6, 2, 2]} />
          </BarChart>
        </ChartContainer>
      ) : (
        <div className="mt-5 flex h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/25 text-center">
          <TrendingUp className="size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-bold text-foreground">Sem dados para o gráfico</p>
          <p className="mt-1 text-xs text-muted-foreground">Adicione um lançamento neste mês.</p>
        </div>
      )}
    </article>
  );
}

function ExpenseCategoryChart({ occurrences }: { occurrences: FinanceOccurrence[] }) {
  const data = buildExpenseCategoryData(occurrences).map((item) => ({
    ...item,
    fill: categoryColorByValue[item.category] ?? "var(--color-chart-5)",
  }));
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <article className="rounded-[2rem] border border-border bg-card p-5 shadow-lg sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
            Distribuição
          </p>
          <h2 className="mt-1 text-lg font-black text-foreground">Gastos por categoria</h2>
        </div>
        <span className="flex size-10 items-center justify-center rounded-2xl bg-red-300/10 text-red-300">
          <TrendingDown className="size-5" aria-hidden />
        </span>
      </div>

      {data.length > 0 ? (
        <>
          <div className="relative mt-3">
            <ChartContainer
              config={categoryChartConfig}
              className="mx-auto h-52 w-full max-w-sm aspect-auto"
            >
              <PieChart accessibilityLayer>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      hideIndicator
                      formatter={(value, name) => (
                        <div className="flex min-w-36 items-center justify-between gap-5">
                          <span className="text-muted-foreground">
                            {getFinanceCategory("expense", String(name)).label}
                          </span>
                          <span className="font-black tabular-nums text-foreground">
                            {formatCurrency(Number(value))}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="category"
                  innerRadius={54}
                  outerRadius={82}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {data.map((item) => (
                    <Cell key={item.category} fill={item.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center">
              <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                Total
              </p>
              <p className="mt-1 text-sm font-black tabular-nums text-foreground">
                {formatCompactCurrency(total)}
              </p>
            </div>
          </div>

          <ul className="space-y-2">
            {data.map((item) => (
              <li key={item.category} className="flex items-center gap-3 text-xs">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.fill }}
                />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.label}</span>
                <span className="font-bold tabular-nums text-foreground">
                  {total > 0 ? Math.round((item.value / total) * 100) : 0}%
                </span>
                <span className="w-20 text-right text-[11px] font-black tabular-nums text-foreground sm:w-24 sm:text-xs">
                  {formatCurrency(item.value)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="mt-5 flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background/25 text-center">
          <ReceiptText className="size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-sm font-bold text-foreground">Nenhum gasto no mês</p>
          <p className="mt-1 text-xs text-muted-foreground">As categorias aparecerão aqui.</p>
        </div>
      )}
    </article>
  );
}

function FinanceEntryCard({
  occurrence,
  busy,
  onToggleSettled,
  onEdit,
  onDelete,
}: {
  occurrence: FinanceOccurrence;
  busy: boolean;
  onToggleSettled: (occurrence: FinanceOccurrence) => void;
  onEdit: (occurrence: FinanceOccurrence) => void;
  onDelete: (occurrence: FinanceOccurrence) => void;
}) {
  const income = occurrence.direction === "income";
  const settled = occurrence.status === "settled";
  const category = getFinanceCategory(occurrence.direction, occurrence.category);
  const amount = settled
    ? (occurrence.actualAmountCents ?? occurrence.plannedAmountCents)
    : occurrence.plannedAmountCents;

  return (
    <li
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] border border-border bg-card p-4 shadow-lg sm:p-5",
        occurrence.status === "cancelled" && "opacity-60",
      )}
      aria-busy={busy}
    >
      <span
        className={cn("absolute inset-y-0 left-0 w-1", income ? "bg-cyan-300" : "bg-red-300")}
        aria-hidden
      />

      <div className="flex flex-wrap items-start gap-3 min-[480px]:flex-nowrap">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-2xl",
            income ? "bg-cyan-300/10 text-cyan-300" : "bg-red-300/10 text-red-300",
          )}
        >
          {income ? (
            <ArrowUpRight className="size-5" aria-hidden />
          ) : (
            <ArrowDownRight className="size-5" aria-hidden />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border bg-background/40 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">
              {category.label}
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em]",
                settled ? "bg-emerald-300/10 text-emerald-300" : "bg-primary/10 text-primary",
              )}
            >
              {settled ? (income ? "Recebido" : "Pago") : "Pendente"}
            </span>
          </div>
          <h3 className="mt-2 truncate text-base font-black text-card-foreground">
            {occurrence.title}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {FINANCE_SCHEDULE_LABELS[occurrence.scheduleType]}
            {occurrence.scheduleType === "installment"
              ? ` · Parcela ${occurrence.sequenceNumber}`
              : ""}
            {` · ${formatFinanceDate(occurrence.dueOn)}`}
          </p>
        </div>

        <div className="ml-14 w-full text-left min-[480px]:ml-0 min-[480px]:w-auto min-[480px]:shrink-0 min-[480px]:text-right">
          <p
            className={cn(
              "text-base font-black tabular-nums sm:text-lg",
              income ? "text-cyan-300" : "text-red-300",
            )}
          >
            {income ? "+" : "−"} {formatCurrency(amount)}
          </p>
        </div>
      </div>

      {occurrence.notes && (
        <p className="mt-3 border-l-2 border-border pl-3 text-xs leading-5 text-muted-foreground">
          {occurrence.notes}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <button
          type="button"
          disabled={busy || occurrence.status === "cancelled"}
          onClick={() => onToggleSettled(occurrence)}
          className={cn(
            "flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-black transition-colors disabled:pointer-events-none disabled:opacity-50",
            settled
              ? "bg-emerald-300/10 text-emerald-300 hover:bg-emerald-300/15"
              : "bg-primary/10 text-primary hover:bg-primary/15",
          )}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : settled ? (
            <RotateCcw className="size-4" aria-hidden />
          ) : (
            <Check className="size-4" aria-hidden />
          )}
          {settled ? "REABRIR" : income ? "RECEBER" : "PAGAR"}
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => onEdit(occurrence)}
            aria-label={`Editar ${occurrence.title}`}
            className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
          >
            <Pencil className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(occurrence)}
            aria-label={`Excluir ${occurrence.title}`}
            className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}

function FinancesPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(getCurrentFinanceMonth);
  const [filter, setFilter] = useState<FinanceFilter>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOccurrence, setEditingOccurrence] = useState<FinanceOccurrence | null>(null);
  const [occurrenceToDelete, setOccurrenceToDelete] = useState<FinanceOccurrence | null>(null);
  const [busyOccurrenceId, setBusyOccurrenceId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const financeQuery = useQuery(financeMonthQuery(user.id, month));

  const occurrences = financeQuery.data ?? [];
  const monthDataUnavailable = financeQuery.data === undefined;
  const activeOccurrences = occurrences.filter((occurrence) => occurrence.status !== "cancelled");
  const summary = summarizeFinance(activeOccurrences);
  const visibleOccurrences = activeOccurrences.filter(
    (occurrence) => filter === "all" || occurrence.direction === filter,
  );
  const incomeCount = activeOccurrences.filter(
    (occurrence) => occurrence.direction === "income",
  ).length;
  const expenseCount = activeOccurrences.filter(
    (occurrence) => occurrence.direction === "expense",
  ).length;
  const settledCount = activeOccurrences.filter(
    (occurrence) => occurrence.status === "settled",
  ).length;

  async function refreshFinance() {
    await queryClient.invalidateQueries({ queryKey: ["finance", user.id] });
  }

  function openCreate() {
    setEditingOccurrence(null);
    setEditorOpen(true);
  }

  function openEdit(occurrence: FinanceOccurrence) {
    setEditingOccurrence(occurrence);
    setEditorOpen(true);
  }

  async function handleToggleSettled(occurrence: FinanceOccurrence) {
    const settling = occurrence.status !== "settled";
    setBusyOccurrenceId(occurrence.id);
    try {
      await setFinanceOccurrenceSettled(occurrence, settling);
      await refreshFinance();
      toast.success(
        settling
          ? occurrence.direction === "income"
            ? "Ganho recebido."
            : "Gasto pago."
          : "Lançamento reaberto.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar o lançamento.",
      );
    } finally {
      setBusyOccurrenceId(null);
    }
  }

  async function handleDelete() {
    if (!occurrenceToDelete) return;
    setDeleting(true);
    try {
      await deleteFinanceSchedule(occurrenceToDelete.scheduleId);
      await refreshFinance();
      toast.success("Lançamento excluído.");
      setOccurrenceToDelete(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível excluir o lançamento.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="relative min-h-dvh bg-background pb-32" aria-label="Finanças">
      <header className="mx-auto grid max-w-6xl grid-cols-[2.5rem_1fr_2.5rem] items-center gap-3 px-5 pb-5 pt-6 sm:px-6">
        <Link
          to="/"
          aria-label="Voltar para a Home"
          className="flex size-10 items-center justify-center rounded-full bg-surface-inactive text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-black tracking-[0.32em] text-primary">CONTROLE DO MÊS</p>
          <h1 className="truncate text-xl font-black tracking-[0.2em] text-foreground">FINANÇAS</h1>
        </div>
        <span className="flex size-10 items-center justify-center text-primary" aria-hidden>
          <WalletCards className="size-6" />
        </span>
      </header>

      <section className="mx-auto max-w-6xl px-5 sm:px-6">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 p-2 shadow-lg">
          <button
            type="button"
            onClick={() => setMonth((current) => shiftFinanceMonth(current, -1))}
            aria-label="Mês anterior"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 text-center">
            <div className="flex items-center justify-center gap-2">
              <p className="truncate text-sm font-black text-foreground sm:text-base">
                {formatFinanceMonth(month)}
              </p>
              {financeQuery.isFetching && (
                <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
              )}
            </div>
            {month !== getCurrentFinanceMonth() && (
              <button
                type="button"
                onClick={() => setMonth(getCurrentFinanceMonth())}
                className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-primary hover:underline"
              >
                Voltar ao mês atual
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMonth((current) => shiftFinanceMonth(current, 1))}
            aria-label="Próximo mês"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>

        {financeQuery.isError && (
          <div
            className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4"
            role="alert"
          >
            <p className="text-sm text-destructive">Não foi possível carregar este mês.</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void financeQuery.refetch()}
            >
              Tentar novamente
            </Button>
          </div>
        )}

        {financeQuery.isPending && (
          <div className="mt-4 flex min-h-52 flex-col items-center justify-center rounded-[2rem] border border-border bg-card/60 text-center">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            <p className="mt-4 text-sm font-black text-foreground">Carregando o mês...</p>
          </div>
        )}

        <div className={cn(monthDataUnavailable && "hidden")}>
          <article className="relative mt-4 overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-card via-card to-secondary p-5 shadow-xl sm:p-7">
            <div className="relative z-10 grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
                  Saldo realizado
                </p>
                <p
                  className={cn(
                    "mt-2 break-words text-3xl font-black tabular-nums min-[400px]:text-4xl sm:text-5xl",
                    balanceColor(summary.settledBalanceCents),
                  )}
                >
                  {formatCurrency(summary.settledBalanceCents)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Saldo previsto:{" "}
                  <span
                    className={cn(
                      "font-black tabular-nums",
                      balanceColor(summary.plannedBalanceCents),
                    )}
                  >
                    {formatCurrency(summary.plannedBalanceCents)}
                  </span>
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {settledCount} de {activeOccurrences.length}{" "}
                  {activeOccurrences.length === 1
                    ? "lançamento realizado"
                    : "lançamentos realizados"}
                </p>
              </div>

              <div className="grid gap-3 min-[420px]:grid-cols-2">
                <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.07] p-4">
                  <div className="flex items-center gap-2 text-cyan-300">
                    <ArrowUpRight className="size-4" aria-hidden />
                    <span className="text-[10px] font-black uppercase tracking-wider">Ganhos</span>
                  </div>
                  <p className="mt-2 text-lg font-black tabular-nums text-foreground sm:text-xl">
                    {formatCurrency(summary.plannedIncomeCents)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {formatCurrency(summary.settledIncomeCents)} recebido
                  </p>
                </div>
                <div className="rounded-2xl border border-red-300/15 bg-red-300/[0.07] p-4">
                  <div className="flex items-center gap-2 text-red-300">
                    <ArrowDownRight className="size-4" aria-hidden />
                    <span className="text-[10px] font-black uppercase tracking-wider">Gastos</span>
                  </div>
                  <p className="mt-2 text-lg font-black tabular-nums text-foreground sm:text-xl">
                    {formatCurrency(summary.plannedExpenseCents)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {formatCurrency(summary.settledExpenseCents)} pago
                  </p>
                </div>
              </div>
            </div>
            <CircleDollarSign
              className="absolute -right-8 -top-8 size-44 text-primary/[0.04]"
              aria-hidden
            />
          </article>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_0.85fr]">
            <FinanceFlowChart occurrences={activeOccurrences} />
            <ExpenseCategoryChart occurrences={activeOccurrences} />
          </div>

          <section className="mt-7" aria-labelledby="finance-entries-title">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                  Movimentações
                </p>
                <h2 id="finance-entries-title" className="mt-1 text-xl font-black text-foreground">
                  Lançamentos do mês
                </h2>
              </div>
              <Button
                type="button"
                onClick={openCreate}
                className="hidden rounded-xl font-black sm:flex"
              >
                <Plus className="size-4" aria-hidden />
                Novo lançamento
              </Button>
            </div>

            <Tabs
              value={filter}
              onValueChange={(value) => setFilter(value as FinanceFilter)}
              className="mt-4"
            >
              <TabsList className="grid h-14 w-full grid-cols-3 rounded-2xl bg-surface-inactive p-1.5">
                <TabsTrigger value="all" className="h-full gap-1 rounded-xl text-xs font-black">
                  Todos
                  <span className="rounded-full bg-background/50 px-1.5 py-0.5 text-[10px]">
                    {activeOccurrences.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="income" className="h-full gap-1 rounded-xl text-xs font-black">
                  Ganhos
                  <span className="rounded-full bg-background/50 px-1.5 py-0.5 text-[10px]">
                    {incomeCount}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="expense" className="h-full gap-1 rounded-xl text-xs font-black">
                  Gastos
                  <span className="rounded-full bg-background/50 px-1.5 py-0.5 text-[10px]">
                    {expenseCount}
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {visibleOccurrences.length > 0 ? (
              <ul className="mt-4 grid gap-3 lg:grid-cols-2">
                {visibleOccurrences.map((occurrence) => (
                  <FinanceEntryCard
                    key={occurrence.id}
                    occurrence={occurrence}
                    busy={busyOccurrenceId === occurrence.id}
                    onToggleSettled={handleToggleSettled}
                    onEdit={openEdit}
                    onDelete={setOccurrenceToDelete}
                  />
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-[2rem] border border-dashed border-border bg-card/40 px-6 py-12 text-center">
                <span className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
                  <ReceiptText className="size-8" aria-hidden />
                </span>
                <h3 className="mt-5 text-lg font-black text-foreground">
                  {filter === "all"
                    ? "Nenhum lançamento neste mês"
                    : filter === "income"
                      ? "Nenhum ganho neste mês"
                      : "Nenhum gasto neste mês"}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Adicione sua primeira movimentação para acompanhar o saldo.
                </p>
                <Button type="button" onClick={openCreate} className="mt-5 rounded-xl font-bold">
                  <Plus className="size-4" aria-hidden />
                  Adicionar lançamento
                </Button>
              </div>
            )}
          </section>
        </div>
      </section>

      <button
        type="button"
        aria-label="Adicionar lançamento"
        onClick={openCreate}
        className="fixed right-5 z-30 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background active:scale-95 sm:hidden"
        style={{
          bottom: "calc(1.5rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))",
        }}
      >
        <Plus className="size-8" aria-hidden />
      </button>

      <FinanceEntryDialog
        open={editorOpen}
        occurrence={editingOccurrence}
        month={month}
        onOpenChange={setEditorOpen}
        onSaved={refreshFinance}
      />

      <AlertDialog
        open={Boolean(occurrenceToDelete)}
        onOpenChange={(open) => !open && !deleting && setOccurrenceToDelete(null)}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-3xl border-border bg-card sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {occurrenceToDelete && occurrenceToDelete.scheduleType !== "one_time"
                ? `“${occurrenceToDelete.title}” e todos os meses desta série serão removidos, inclusive o histórico.`
                : occurrenceToDelete
                  ? `“${occurrenceToDelete.title}” será removido permanentemente.`
                  : "O lançamento será removido permanentemente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
