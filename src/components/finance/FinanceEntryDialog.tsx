import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarDays,
  Loader2,
  Save,
  WalletCards,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createFinanceSchedule,
  defaultDateForFinanceMonth,
  FINANCE_CATEGORIES,
  FINANCE_SCHEDULE_LABELS,
  financeOccurrenceInputSchema,
  financeScheduleInputSchema,
  formatCurrency,
  formatCurrencyInput,
  parseCurrencyToCents,
  updateFinanceOccurrence,
  type FinanceDirection,
  type FinanceOccurrence,
  type FinanceScheduleType,
} from "@/lib/finance";
import { cn } from "@/lib/utils";

type FinanceEntryDialogProps = {
  open: boolean;
  occurrence: FinanceOccurrence | null;
  month: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
};

const TYPE_DETAILS: Record<FinanceScheduleType, { description: string }> = {
  one_time: { description: "Uma única entrada" },
  fixed: { description: "Repete todos os meses" },
  recurring: { description: "Intervalo configurável" },
  installment: { description: "Dividido em parcelas" },
};

const DIRECTION_OPTIONS = [
  {
    value: "expense" as const,
    label: "Gasto",
    description: "Dinheiro que sai",
    icon: ArrowDownCircle,
  },
  {
    value: "income" as const,
    label: "Ganho",
    description: "Dinheiro que entra",
    icon: ArrowUpCircle,
  },
];

function scheduleTypesFor(direction: FinanceDirection): FinanceScheduleType[] {
  return direction === "income" ? ["one_time", "recurring"] : ["fixed", "recurring", "installment"];
}

export function FinanceEntryDialog({
  open,
  occurrence,
  month,
  onOpenChange,
  onSaved,
}: FinanceEntryDialogProps) {
  const [direction, setDirection] = useState<FinanceDirection>("expense");
  const [scheduleType, setScheduleType] = useState<FinanceScheduleType>("fixed");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("food");
  const [amount, setAmount] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [intervalMonths, setIntervalMonths] = useState("1");
  const [installmentCount, setInstallmentCount] = useState("2");
  const [notes, setNotes] = useState("");
  const [initiallySettled, setInitiallySettled] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (occurrence) {
      setDirection(occurrence.direction);
      setScheduleType(occurrence.scheduleType);
      setTitle(occurrence.title);
      setCategory(occurrence.category);
      setAmount(formatCurrencyInput(occurrence.plannedAmountCents));
      setStartsOn(occurrence.dueOn);
      setEndsOn("");
      setIntervalMonths("1");
      setInstallmentCount("2");
      setNotes(occurrence.notes);
      setInitiallySettled(occurrence.status === "settled");
    } else {
      setDirection("expense");
      setScheduleType("fixed");
      setTitle("");
      setCategory("food");
      setAmount("");
      setStartsOn(defaultDateForFinanceMonth(month));
      setEndsOn("");
      setIntervalMonths("1");
      setInstallmentCount("2");
      setNotes("");
      setInitiallySettled(false);
    }
    setFormError(null);
  }, [month, occurrence, open]);

  function changeDirection(nextDirection: FinanceDirection) {
    setDirection(nextDirection);
    setScheduleType(nextDirection === "income" ? "one_time" : "fixed");
    setCategory(nextDirection === "income" ? "salary" : "food");
  }

  function normalizeAmount() {
    const cents = parseCurrencyToCents(amount);
    if (cents !== null) setAmount(formatCurrencyInput(cents));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = parseCurrencyToCents(amount);
    if (amountCents === null) {
      setFormError("Informe um valor válido maior que zero.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (occurrence) {
        const parsed = financeOccurrenceInputSchema.safeParse({
          title,
          category,
          amountCents,
          dueOn: startsOn,
          notes,
        });
        if (!parsed.success)
          throw new Error(parsed.error.issues[0]?.message ?? "Confira os dados.");
        await updateFinanceOccurrence(occurrence, parsed.data);
      } else {
        const parsed = financeScheduleInputSchema.safeParse({
          direction,
          scheduleType,
          title,
          category,
          amountCents,
          startsOn,
          endsOn: scheduleType === "recurring" && endsOn ? endsOn : null,
          intervalMonths: scheduleType === "recurring" ? Number(intervalMonths) : null,
          installmentCount: scheduleType === "installment" ? Number(installmentCount) : null,
          notes,
        });
        if (!parsed.success)
          throw new Error(parsed.error.issues[0]?.message ?? "Confira os dados.");
        await createFinanceSchedule(parsed.data, initiallySettled);
      }

      await onSaved();
      toast.success(occurrence ? "Lançamento atualizado." : "Lançamento adicionado.");
      onOpenChange(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Não foi possível salvar o lançamento.",
      );
    } finally {
      setSaving(false);
    }
  }

  const parsedAmount = parseCurrencyToCents(amount);
  const parsedInstallmentCount = Number(installmentCount);
  const installmentBase =
    parsedAmount && Number.isInteger(parsedInstallmentCount) && parsedInstallmentCount >= 2
      ? Math.floor(parsedAmount / parsedInstallmentCount)
      : null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !saving && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-[2rem] border-border bg-card p-5 sm:max-w-xl sm:p-6">
        <DialogHeader className="pr-7 text-left">
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <WalletCards className="size-6" aria-hidden />
          </span>
          <DialogTitle className="text-xl font-black text-foreground">
            {occurrence ? "Editar lançamento" : "Novo lançamento"}
          </DialogTitle>
          <DialogDescription>
            {occurrence
              ? "A alteração vale somente para este mês."
              : "Registre um ganho ou gasto e acompanhe o saldo do mês."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-1">
          <fieldset disabled={saving} className="space-y-5 disabled:opacity-70">
            {!occurrence ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-foreground">MOVIMENTO</legend>
                <div className="grid grid-cols-2 gap-2">
                  {DIRECTION_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const active = direction === option.value;
                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "cursor-pointer rounded-2xl border p-3 transition-colors",
                          active
                            ? option.value === "income"
                              ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-200"
                              : "border-red-300/50 bg-red-300/10 text-red-200"
                            : "border-border bg-background/40 text-muted-foreground",
                        )}
                      >
                        <input
                          type="radio"
                          name="finance-direction"
                          value={option.value}
                          checked={active}
                          onChange={() => changeDirection(option.value)}
                          className="sr-only"
                        />
                        <Icon className="size-5" aria-hidden />
                        <span className="mt-2 block text-sm font-black">{option.label}</span>
                        <span className="mt-0.5 block text-[11px]">{option.description}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-background/40 px-4 py-3 text-sm">
                {direction === "income" ? (
                  <ArrowUpCircle className="size-5 text-cyan-300" aria-hidden />
                ) : (
                  <ArrowDownCircle className="size-5 text-red-300" aria-hidden />
                )}
                <span className="font-black text-foreground">
                  {direction === "income" ? "Ganho" : "Gasto"}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {FINANCE_SCHEDULE_LABELS[scheduleType]}
                </span>
              </div>
            )}

            {!occurrence && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-foreground">TIPO</legend>
                <div
                  className={cn(
                    "grid gap-2",
                    direction === "income" ? "grid-cols-2" : "grid-cols-3",
                  )}
                >
                  {scheduleTypesFor(direction).map((value) => {
                    const active = scheduleType === value;
                    return (
                      <label
                        key={value}
                        className={cn(
                          "cursor-pointer rounded-2xl border p-3 transition-colors",
                          active
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border bg-background/40 text-muted-foreground",
                        )}
                      >
                        <input
                          type="radio"
                          name="finance-schedule-type"
                          value={value}
                          checked={active}
                          onChange={() => setScheduleType(value)}
                          className="sr-only"
                        />
                        <span className="block text-xs font-black sm:text-sm">
                          {FINANCE_SCHEDULE_LABELS[value]}
                        </span>
                        <span className="mt-1 hidden text-[10px] leading-4 sm:block">
                          {TYPE_DETAILS[value].description}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className="space-y-2">
              <Label htmlFor="finance-title">DESCRIÇÃO</Label>
              <Input
                id="finance-title"
                value={title}
                maxLength={100}
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
                placeholder={direction === "income" ? "Salário, venda..." : "Aluguel, mercado..."}
                className="h-12 rounded-xl bg-background/60"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="finance-category">CATEGORIA</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="finance-category" className="h-12 rounded-xl bg-background/60">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {FINANCE_CATEGORIES[direction].map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="finance-amount">
                  {scheduleType === "installment" ? "VALOR TOTAL" : "VALOR"}
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                    R$
                  </span>
                  <Input
                    id="finance-amount"
                    value={amount}
                    inputMode="decimal"
                    onChange={(event) => setAmount(event.target.value)}
                    onBlur={normalizeAmount}
                    placeholder="0,00"
                    className="h-12 rounded-xl bg-background/60 pl-10 tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div
              className={cn(
                "grid gap-4",
                scheduleType === "installment" && !occurrence && "sm:grid-cols-2",
              )}
            >
              <div className="space-y-2">
                <Label htmlFor="finance-date">
                  {occurrence
                    ? "VENCIMENTO"
                    : scheduleType === "one_time"
                      ? "DATA"
                      : "PRIMEIRO VENCIMENTO"}
                </Label>
                <Input
                  id="finance-date"
                  type="date"
                  value={startsOn}
                  onChange={(event) => setStartsOn(event.target.value)}
                  className="h-12 rounded-xl bg-background/60"
                />
              </div>

              {scheduleType === "installment" && !occurrence && (
                <div className="space-y-2">
                  <Label htmlFor="finance-installments">PARCELAS</Label>
                  <Input
                    id="finance-installments"
                    type="number"
                    min={2}
                    max={600}
                    value={installmentCount}
                    onChange={(event) => setInstallmentCount(event.target.value)}
                    className="h-12 rounded-xl bg-background/60 tabular-nums"
                  />
                </div>
              )}
            </div>

            {scheduleType === "installment" && !occurrence && installmentBase !== null && (
              <p className="rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary">
                {parsedInstallmentCount} parcelas a partir de {formatCurrency(installmentBase)}. Os
                centavos restantes entram nas primeiras parcelas.
              </p>
            )}

            {scheduleType === "recurring" && !occurrence && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="finance-interval">REPETIR A CADA</Label>
                  <div className="relative">
                    <Input
                      id="finance-interval"
                      type="number"
                      min={1}
                      max={120}
                      value={intervalMonths}
                      onChange={(event) => setIntervalMonths(event.target.value)}
                      className="h-12 rounded-xl bg-background/60 pr-16 tabular-nums"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      meses
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="finance-end-date">TERMINAR EM</Label>
                  <Input
                    id="finance-end-date"
                    type="date"
                    min={startsOn || undefined}
                    value={endsOn}
                    onChange={(event) => setEndsOn(event.target.value)}
                    className="h-12 rounded-xl bg-background/60"
                  />
                  <p className="text-[10px] text-muted-foreground">Opcional</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="finance-notes">OBSERVAÇÃO</Label>
              <Textarea
                id="finance-notes"
                value={notes}
                maxLength={1000}
                rows={3}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Informação adicional..."
                className="min-h-24 resize-none rounded-xl bg-background/60"
              />
            </div>

            {!occurrence && (
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-background/40 p-4">
                <div>
                  <Label htmlFor="finance-settled" className="text-sm font-black text-foreground">
                    {direction === "income" ? "Já foi recebido" : "Já foi pago"}
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Inclui o valor no saldo realizado.
                  </p>
                </div>
                <Switch
                  id="finance-settled"
                  checked={initiallySettled}
                  onCheckedChange={setInitiallySettled}
                  aria-label={direction === "income" ? "Marcar como recebido" : "Marcar como pago"}
                />
              </div>
            )}
          </fieldset>

          {formError && (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          )}

          <DialogFooter>
            <Button
              type="submit"
              disabled={saving}
              className="h-12 w-full rounded-xl font-black sm:w-auto"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              {occurrence ? "SALVAR ALTERAÇÕES" : "ADICIONAR LANÇAMENTO"}
            </Button>
          </DialogFooter>
        </form>

        <CalendarDays
          className="pointer-events-none absolute -bottom-7 -right-5 size-28 text-primary/[0.03]"
          aria-hidden
        />
      </DialogContent>
    </Dialog>
  );
}
