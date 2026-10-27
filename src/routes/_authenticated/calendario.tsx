import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { addDays, format, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ComponentProps,
  type CSSProperties,
  type FormEvent,
} from "react";
import { toast } from "sonner";

import { BottomNav } from "@/components/BottomNav";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createReminder,
  deleteReminder,
  listReminders,
  REMINDER_COLORS,
  reminderInputSchema,
  updateReminder,
  type Reminder,
  type ReminderColor,
} from "@/lib/reminders";
import { cn } from "@/lib/utils";

const COLOR_STYLES: Record<ReminderColor, { label: string; dot: string; soft: string }> = {
  orange: { label: "Laranja", dot: "bg-orange-400", soft: "bg-orange-400/10" },
  blue: { label: "Azul", dot: "bg-sky-400", soft: "bg-sky-400/10" },
  green: { label: "Verde", dot: "bg-emerald-400", soft: "bg-emerald-400/10" },
  purple: { label: "Roxo", dot: "bg-violet-400", soft: "bg-violet-400/10" },
  pink: { label: "Rosa", dot: "bg-pink-400", soft: "bg-pink-400/10" },
};

const ReminderDaysContext = createContext<ReadonlyMap<string, readonly Reminder[]>>(new Map());

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("Data inválida.");
  }
  return new Date(year, month - 1, day);
}

function calendarRange(month: Date) {
  const firstVisibleDay = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  return {
    from: toDateKey(firstVisibleDay),
    to: toDateKey(addDays(firstVisibleDay, 41)),
  };
}

function remindersQuery(month: Date) {
  const range = calendarRange(month);
  return queryOptions({
    queryKey: ["reminders", range.from, range.to],
    queryFn: () => listReminders(range.from, range.to),
  });
}

function ReminderDayButton(props: ComponentProps<typeof CalendarDayButton>) {
  const remindersByDate = useContext(ReminderDaysContext);
  const reminders = remindersByDate.get(toDateKey(props.day.date)) ?? [];
  const defaultLabel = format(props.day.date, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  const dayLabel = typeof props["aria-label"] === "string" ? props["aria-label"] : defaultLabel;
  const reminderLabel = reminders.length === 1 ? "1 lembrete" : `${reminders.length} lembretes`;

  return (
    <CalendarDayButton
      {...props}
      aria-label={reminders.length > 0 ? `${dayLabel}. ${reminderLabel}` : dayLabel}
    >
      {props.children}
      {reminders.length > 0 ? (
        <span
          className="absolute bottom-1 flex items-center justify-center gap-0.5"
          style={{ opacity: 1 }}
          aria-hidden
        >
          {reminders.slice(0, 4).map((reminder) => (
            <span
              key={reminder.id}
              className={cn("size-1 rounded-full sm:size-1.5", COLOR_STYLES[reminder.color].dot)}
            />
          ))}
        </span>
      ) : null}
    </CalendarDayButton>
  );
}

export const Route = createFileRoute("/_authenticated/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário | FinNote" },
      {
        name: "description",
        content: "Organize lembretes por dia e acompanhe sua agenda no FinNote.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(remindersQuery(new Date())),
  component: CalendarPage,
  errorComponent: ({ error }) => (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center" role="alert">
        <h1 className="text-lg font-black text-foreground">Não foi possível abrir o calendário</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Link
          to="/treinos"
          className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          Voltar para treinos
        </Link>
      </div>
    </main>
  ),
});

function CalendarPage() {
  const initialDate = new Date();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(initialDate));
  const [calendarPending, startCalendarTransition] = useTransition();
  const { data: reminders } = useSuspenseQuery(remindersQuery(visibleMonth));
  const queryClient = useQueryClient();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reminderDate, setReminderDate] = useState(() => toDateKey(initialDate));
  const [color, setColor] = useState<ReminderColor>("orange");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reminderToDelete, setReminderToDelete] = useState<Reminder | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remindersByDate = new Map<string, Reminder[]>();
  for (const reminder of reminders) {
    const dateReminders = remindersByDate.get(reminder.reminderDate) ?? [];
    dateReminders.push(reminder);
    remindersByDate.set(reminder.reminderDate, dateReminders);
  }

  const selectedDateKey = toDateKey(selectedDate);
  const selectedReminders = remindersByDate.get(selectedDateKey) ?? [];
  const selectedDateLabel = format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR });

  function openCreateReminder() {
    setEditingReminder(null);
    setTitle("");
    setDescription("");
    setReminderDate(selectedDateKey);
    setColor("orange");
    setFormError(null);
    setEditorOpen(true);
  }

  function openEditReminder(reminder: Reminder) {
    setEditingReminder(reminder);
    setTitle(reminder.title);
    setDescription(reminder.description ?? "");
    setReminderDate(reminder.reminderDate);
    setColor(reminder.color);
    setFormError(null);
    setEditorOpen(true);
  }

  function changeMonth(month: Date) {
    startCalendarTransition(() => {
      const firstDay = startOfMonth(month);
      setVisibleMonth(firstDay);
      setSelectedDate(firstDay);
    });
  }

  function selectToday() {
    const today = new Date();
    startCalendarTransition(() => {
      setSelectedDate(today);
      setVisibleMonth(startOfMonth(today));
    });
  }

  async function saveReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { title, description, reminderDate, color };
    const parsed = reminderInputSchema.safeParse(input);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Confira os dados do lembrete.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const savedReminder = editingReminder
        ? await updateReminder(editingReminder.id, parsed.data)
        : await createReminder(parsed.data);
      await queryClient.invalidateQueries({ queryKey: ["reminders"] });

      const savedDate = fromDateKey(savedReminder.reminderDate);
      startCalendarTransition(() => {
        setSelectedDate(savedDate);
        setVisibleMonth(startOfMonth(savedDate));
      });
      setEditorOpen(false);
      toast.success(editingReminder ? "Lembrete atualizado." : "Lembrete criado.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível salvar o lembrete.";
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteReminder() {
    if (!reminderToDelete) return;
    setDeleting(true);
    try {
      await deleteReminder(reminderToDelete.id);
      await queryClient.invalidateQueries({ queryKey: ["reminders"] });
      setReminderToDelete(null);
      toast.success("Lembrete excluído.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o lembrete.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main
      className="min-h-dvh bg-background"
      style={{
        paddingBottom:
          "calc(7rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))",
      }}
      aria-busy={calendarPending}
    >
      <header className="mx-auto grid max-w-5xl grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-4 pb-6 pt-5 sm:px-6">
        <Link
          to="/treinos"
          aria-label="Voltar para treinos"
          className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </Link>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-black tracking-[0.3em] text-primary">FINNOTE</p>
          <h1 className="truncate text-xl font-black tracking-[0.16em] text-foreground">
            CALENDÁRIO
          </h1>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="px-3 font-bold"
          onClick={selectToday}
          disabled={calendarPending}
        >
          Hoje
        </Button>
      </header>

      <div className="mx-auto grid max-w-5xl gap-5 px-4 sm:px-6 lg:grid-cols-[minmax(20rem,26rem)_1fr] lg:items-start">
        <section
          aria-labelledby="calendar-heading"
          className="rounded-[2rem] border border-border bg-card p-2 shadow-xl sm:p-4"
        >
          <div className="flex items-center gap-2 px-3 pb-2 pt-2">
            <CalendarDays className="size-5 text-primary" aria-hidden />
            <h2
              id="calendar-heading"
              className="text-sm font-black tracking-widest text-foreground"
            >
              SELECIONE UM DIA
            </h2>
            {calendarPending ? (
              <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                <span className="sr-only">Carregando mês</span>
              </span>
            ) : null}
          </div>

          <ReminderDaysContext.Provider value={remindersByDate}>
            <Calendar
              mode="single"
              required
              selected={selectedDate}
              month={visibleMonth}
              onSelect={(date) => {
                if (!date) return;
                if (
                  date.getMonth() !== visibleMonth.getMonth() ||
                  date.getFullYear() !== visibleMonth.getFullYear()
                ) {
                  startCalendarTransition(() => {
                    setSelectedDate(date);
                    setVisibleMonth(startOfMonth(date));
                  });
                  return;
                }
                setSelectedDate(date);
              }}
              onMonthChange={changeMonth}
              locale={ptBR}
              weekStartsOn={1}
              fixedWeeks
              navLayout="after"
              aria-label="Calendário de lembretes"
              className="w-full bg-transparent"
              classNames={{
                root: "w-full",
                months: "w-full",
                month: "w-full",
                month_grid: "w-full",
              }}
              style={{ "--cell-size": "clamp(2.25rem, 10vw, 3rem)" } as CSSProperties}
              components={{ DayButton: ReminderDayButton }}
            />
          </ReminderDaysContext.Provider>

          <p className="px-3 pb-3 text-center text-[11px] text-muted-foreground">
            Os pontos coloridos indicam lembretes cadastrados.
          </p>
        </section>

        <section
          aria-labelledby="day-agenda-heading"
          className="min-h-64 rounded-[2rem] border border-border bg-card p-5 shadow-xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                Agenda do dia
              </p>
              <h2 id="day-agenda-heading" className="mt-1 text-xl font-black text-foreground">
                {selectedDateLabel}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
                {selectedReminders.length}{" "}
                {selectedReminders.length === 1 ? "lembrete cadastrado" : "lembretes cadastrados"}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              className="size-11 shrink-0 rounded-full"
              onClick={openCreateReminder}
              aria-label="Adicionar lembrete neste dia"
            >
              <Plus className="size-5" aria-hidden />
            </Button>
          </div>

          {selectedReminders.length > 0 ? (
            <ul className="mt-5 space-y-3">
              {selectedReminders.map((reminder) => (
                <li
                  key={reminder.id}
                  className={cn(
                    "flex overflow-hidden rounded-2xl border border-border",
                    COLOR_STYLES[reminder.color].soft,
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                    onClick={() => openEditReminder(reminder)}
                  >
                    <span
                      className={cn(
                        "size-3 shrink-0 rounded-full",
                        COLOR_STYLES[reminder.color].dot,
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">
                        {reminder.title}
                      </span>
                      {reminder.description ? (
                        <span className="mt-1 line-clamp-2 block whitespace-pre-line text-xs text-muted-foreground">
                          {reminder.description}
                        </span>
                      ) : null}
                    </span>
                    <Pencil className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="flex w-12 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-destructive"
                    onClick={() => setReminderToDelete(reminder)}
                    aria-label={`Excluir lembrete ${reminder.title}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-6 rounded-3xl border border-dashed border-border px-6 py-10 text-center">
              <CalendarDays className="mx-auto size-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm font-bold text-foreground">
                Nenhum lembrete para este dia
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Adicione um lembrete e escolha uma cor para marcar a data.
              </p>
              <Button type="button" variant="outline" className="mt-5" onClick={openCreateReminder}>
                <Plus className="size-4" aria-hidden />
                Adicionar lembrete
              </Button>
            </div>
          )}
        </section>
      </div>

      <BottomNav />

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (saving) return;
          setEditorOpen(open);
        }}
      >
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-3xl border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingReminder ? "Editar lembrete" : "Novo lembrete"}</DialogTitle>
            <DialogDescription>
              Escolha a data, escreva o lembrete e defina a cor do marcador.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={saveReminder} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="reminder-title">Título</Label>
              <Input
                id="reminder-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={80}
                placeholder="Ex.: Avaliação física"
                autoFocus
                required
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reminder-date">Data</Label>
              <Input
                id="reminder-date"
                type="date"
                value={reminderDate}
                onChange={(event) => setReminderDate(event.target.value)}
                required
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="reminder-description">Descrição opcional</Label>
                <span className="text-[11px] text-muted-foreground">{description.length}/500</span>
              </div>
              <Textarea
                id="reminder-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Inclua mais detalhes..."
                disabled={saving}
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Cor do marcador</legend>
              <div className="grid grid-cols-5 gap-2">
                {REMINDER_COLORS.map((option) => {
                  const styles = COLOR_STYLES[option];
                  const selected = color === option;
                  return (
                    <label
                      key={option}
                      className="flex cursor-pointer flex-col items-center gap-1.5 text-[10px] font-semibold text-muted-foreground"
                    >
                      <input
                        type="radio"
                        name="reminder-color"
                        value={option}
                        checked={selected}
                        onChange={() => setColor(option)}
                        className="sr-only"
                        disabled={saving}
                      />
                      <span
                        className={cn(
                          "flex size-10 items-center justify-center rounded-full border-2 transition-transform",
                          selected
                            ? "scale-105 border-foreground ring-2 ring-primary ring-offset-2 ring-offset-card"
                            : "border-transparent",
                        )}
                      >
                        <span className={cn("size-6 rounded-full", styles.dot)} aria-hidden />
                      </span>
                      {styles.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {formError ? (
              <p
                role="alert"
                className="rounded-xl bg-destructive/15 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </p>
            ) : null}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditorOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {saving ? "Salvando..." : editingReminder ? "Salvar alterações" : "Criar lembrete"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={reminderToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setReminderToDelete(null);
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-3xl border-border bg-card sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lembrete?</AlertDialogTitle>
            <AlertDialogDescription>
              O lembrete “{reminderToDelete?.title}” será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void confirmDeleteReminder();
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
