import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useBlocker } from "@tanstack/react-router";
import {
  ArrowLeft,
  BellRing,
  Check,
  Clock3,
  Droplets,
  Loader2,
  Pencil,
  Plus,
  Salad,
  Save,
  Smartphone,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MealEditorDialog } from "@/components/diet/MealEditorDialog";
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
import {
  DEFAULT_DIET_PLAN_INPUT,
  dietPlanInputSchema,
  getDietPlan,
  saveDietPlan,
  type DietMealInput,
  type DietPlan,
  type DietPlanInput,
} from "@/lib/diet";
import {
  dietWaterReminderSlots,
  getDietNotificationPermissionStatus,
  reconcileDietNotifications,
  requestDietNotificationPermissions,
  type DietNotificationPermissionStatus,
} from "@/lib/diet-notifications";
import { cn } from "@/lib/utils";

const WEEKDAYS = [
  { index: 1, short: "SEG", label: "Segunda-feira" },
  { index: 2, short: "TER", label: "Terça-feira" },
  { index: 3, short: "QUA", label: "Quarta-feira" },
  { index: 4, short: "QUI", label: "Quinta-feira" },
  { index: 5, short: "SEX", label: "Sexta-feira" },
  { index: 6, short: "SÁB", label: "Sábado" },
  { index: 0, short: "DOM", label: "Domingo" },
] as const;

const WATER_INTERVALS = [30, 60, 90, 120, 180, 240, 360] as const;

type DietMealDraft = DietMealInput & { key: string };
type DietDayDraft = { dayOfWeek: number; meals: DietMealDraft[] };
type DietPlanDraft = Omit<DietPlanInput, "days"> & { days: DietDayDraft[] };
type MealReference = { dayOfWeek: number; key: string; name: string };

function dietPlanQuery(userId: string) {
  return queryOptions({
    queryKey: ["diet", "plan", userId],
    queryFn: () => getDietPlan(userId),
  });
}

function mealKey() {
  return crypto.randomUUID();
}

function draftFromPlan(plan: DietPlan | null): DietPlanDraft {
  if (!plan) {
    return {
      ...DEFAULT_DIET_PLAN_INPUT,
      days: [],
    };
  }

  return {
    waterRemindersEnabled: plan.waterRemindersEnabled,
    waterStartTime: plan.waterStartTime,
    waterEndTime: plan.waterEndTime,
    waterIntervalMinutes: plan.waterIntervalMinutes,
    mealRemindersEnabled: plan.mealRemindersEnabled,
    days: plan.days.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      meals: day.meals.map((meal) => ({
        key: meal.id,
        id: meal.id,
        name: meal.name,
        dish: meal.dish,
        mealTime: meal.mealTime,
      })),
    })),
  };
}

function inputFromDraft(draft: DietPlanDraft): DietPlanInput {
  return {
    waterRemindersEnabled: draft.waterRemindersEnabled,
    waterStartTime: draft.waterStartTime,
    waterEndTime: draft.waterEndTime,
    waterIntervalMinutes: draft.waterIntervalMinutes,
    mealRemindersEnabled: draft.mealRemindersEnabled,
    days: WEEKDAYS.flatMap(({ index }) => {
      const day = draft.days.find((item) => item.dayOfWeek === index);
      if (!day) return [];
      return [
        {
          dayOfWeek: day.dayOfWeek,
          meals: [...day.meals]
            .sort((left, right) => left.mealTime.localeCompare(right.mealTime))
            .map((meal) => ({
              ...(meal.id ? { id: meal.id } : {}),
              name: meal.name,
              dish: meal.dish,
              mealTime: meal.mealTime,
            })),
        },
      ];
    }),
  };
}

function draftSnapshot(draft: DietPlanDraft) {
  return JSON.stringify(inputFromDraft(draft));
}

function weekdayLabel(dayOfWeek: number) {
  return WEEKDAYS.find((day) => day.index === dayOfWeek)?.label ?? "Dia da semana";
}

function intervalLabel(minutes: number) {
  if (minutes < 60) return `${minutes} minutos`;
  const hours = minutes / 60;
  if (Number.isInteger(hours)) return hours === 1 ? "1 hora" : `${hours} horas`;
  return `${Math.floor(hours)}h30`;
}

export const Route = createFileRoute("/_authenticated/dieta")({
  head: () => ({
    meta: [
      { title: "Dieta | FinNote" },
      {
        name: "description",
        content: "Monte seu cardápio semanal e programe lembretes de água e refeições.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dietPlanQuery(context.user.id)),
  component: DietPage,
  errorComponent: ({ error }) => (
    <main className="min-h-dvh bg-background px-5 py-10" role="alert">
      <div className="mx-auto max-w-lg rounded-3xl border border-destructive/30 bg-card p-6">
        <h1 className="text-lg font-black text-foreground">Não foi possível carregar sua dieta</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button asChild variant="outline" className="mt-5 rounded-xl">
          <Link to="/">Voltar para a Home</Link>
        </Button>
      </div>
    </main>
  ),
});

function DietPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { data: plan } = useSuspenseQuery(dietPlanQuery(user.id));
  const [draft, setDraft] = useState<DietPlanDraft>(() => draftFromPlan(plan));
  const [savedSnapshot, setSavedSnapshot] = useState(() => draftSnapshot(draftFromPlan(plan)));
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(plan?.updatedAt ?? null);
  const [selectedDay, setSelectedDay] = useState(() => {
    const today = new Date().getDay();
    if (plan?.days.some((day) => day.dayOfWeek === today)) return today;
    return (
      WEEKDAYS.find(({ index }) => plan?.days.some((day) => day.dayOfWeek === index))?.index ??
      today
    );
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMeal, setEditingMeal] = useState<MealReference | null>(null);
  const [mealToDelete, setMealToDelete] = useState<MealReference | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notificationStatus, setNotificationStatus] =
    useState<DietNotificationPermissionStatus | null>(null);
  const [requestingNotifications, setRequestingNotifications] = useState(false);

  const currentSnapshot = draftSnapshot(draft);
  const isDirty = currentSnapshot !== savedSnapshot;
  const activeDay = draft.days.find((day) => day.dayOfWeek === selectedDay);
  const selectedDayDetails = WEEKDAYS.find((day) => day.index === selectedDay) ?? WEEKDAYS[0];
  const mealCount = draft.days.reduce((total, day) => total + day.meals.length, 0);
  const waterSlots = dietWaterReminderSlots(
    draft.waterStartTime,
    draft.waterEndTime,
    draft.waterIntervalMinutes,
  );
  const currentEditingMeal = editingMeal
    ? (draft.days
        .find((day) => day.dayOfWeek === editingMeal.dayOfWeek)
        ?.meals.find((meal) => meal.key === editingMeal.key) ?? null)
    : null;

  useBlocker({
    shouldBlockFn: () => {
      if (saving) return true;
      return isDirty && !window.confirm("Descartar as alterações feitas na dieta?");
    },
    enableBeforeUnload: () => isDirty || saving,
    disabled: !isDirty && !saving,
  });

  useEffect(() => {
    let active = true;
    void getDietNotificationPermissionStatus()
      .then((status) => {
        if (active) setNotificationStatus(status);
      })
      .catch(() => {
        if (active) setNotificationStatus(null);
      });
    return () => {
      active = false;
    };
  }, []);

  function updateDraft(patch: Partial<DietPlanDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setFormError(null);
  }

  function setDayEnabled(dayOfWeek: number, enabled: boolean) {
    const day = draft.days.find((item) => item.dayOfWeek === dayOfWeek);
    if (
      !enabled &&
      day?.meals.length &&
      !window.confirm("Remover este dia e todas as refeições dele?")
    ) {
      return;
    }

    setDraft((current) => {
      if (enabled) {
        return current.days.some((item) => item.dayOfWeek === dayOfWeek)
          ? current
          : { ...current, days: [...current.days, { dayOfWeek, meals: [] }] };
      }

      return { ...current, days: current.days.filter((item) => item.dayOfWeek !== dayOfWeek) };
    });
    setFormError(null);
  }

  function openCreateMeal() {
    if (!activeDay) return;
    if (activeDay.meals.length >= 24) {
      toast.error("Um dia pode ter no máximo 24 refeições.");
      return;
    }
    setEditingMeal(null);
    setEditorOpen(true);
  }

  function openEditMeal(meal: DietMealDraft) {
    setEditingMeal({ dayOfWeek: selectedDay, key: meal.key, name: meal.name });
    setEditorOpen(true);
  }

  function handleMealSaved(meal: DietMealInput) {
    setDraft((current) => ({
      ...current,
      days: current.days.map((day) => {
        if (day.dayOfWeek !== selectedDay) return day;
        if (!editingMeal) {
          return { ...day, meals: [...day.meals, { ...meal, key: mealKey() }] };
        }
        return {
          ...day,
          meals: day.meals.map((item) =>
            item.key === editingMeal.key ? { ...meal, key: item.key } : item,
          ),
        };
      }),
    }));
    setEditingMeal(null);
    setFormError(null);
  }

  function handleDeleteMeal() {
    if (!mealToDelete) return;
    setDraft((current) => ({
      ...current,
      days: current.days.map((day) =>
        day.dayOfWeek === mealToDelete.dayOfWeek
          ? { ...day, meals: day.meals.filter((meal) => meal.key !== mealToDelete.key) }
          : day,
      ),
    }));
    setMealToDelete(null);
    setFormError(null);
  }

  async function handleEnableNotifications() {
    setRequestingNotifications(true);
    try {
      const status = await requestDietNotificationPermissions();
      setNotificationStatus(status);
      if (status.display !== "granted") {
        toast.error("Permita as notificações nas configurações do celular.");
        return;
      }
      if (!isDirty) await reconcileDietNotifications(user.id);
      toast.success(
        isDirty ? "Permissão concedida. Salve a dieta para ativar os avisos." : "Avisos ativados.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ativar os avisos.");
    } finally {
      setRequestingNotifications(false);
    }
  }

  async function handleSave() {
    const parsed = dietPlanInputSchema.safeParse(inputFromDraft(draft));
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Confira os dados da dieta.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const savedPlan = await saveDietPlan(parsed.data, expectedUpdatedAt);
      const savedDraft = draftFromPlan(savedPlan);
      queryClient.setQueryData(dietPlanQuery(user.id).queryKey, savedPlan);
      setDraft(savedDraft);
      setSavedSnapshot(draftSnapshot(savedDraft));
      setExpectedUpdatedAt(savedPlan.updatedAt);

      let notificationsUpdated = true;
      let updatedNotificationStatus = notificationStatus;
      try {
        await reconcileDietNotifications(user.id);
        updatedNotificationStatus = await getDietNotificationPermissionStatus();
        setNotificationStatus(updatedNotificationStatus);
      } catch {
        notificationsUpdated = false;
      }

      toast.success("Dieta salva.");
      if (!notificationsUpdated) {
        toast.warning("A dieta foi salva, mas os avisos do celular não puderam ser atualizados.");
      } else if (
        updatedNotificationStatus?.supported &&
        (savedPlan.waterRemindersEnabled ||
          (savedPlan.mealRemindersEnabled && savedPlan.days.some((day) => day.meals.length > 0))) &&
        updatedNotificationStatus.display !== "granted"
      ) {
        toast.warning("Ative as notificações para receber os lembretes no celular.");
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar a dieta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="relative min-h-dvh bg-background pb-40" aria-label="Dieta">
      <header className="mx-auto grid max-w-5xl grid-cols-[2.5rem_1fr_2.5rem] items-center gap-3 px-5 pb-6 pt-6 sm:px-6">
        <Link
          to="/"
          aria-label="Voltar para a Home"
          className="flex size-10 items-center justify-center rounded-full bg-surface-inactive text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-black tracking-[0.32em] text-primary">
            ROTINA E BEM-ESTAR
          </p>
          <h1 className="truncate text-xl font-black tracking-[0.2em] text-foreground">DIETA</h1>
        </div>
        <span className="flex size-10 items-center justify-center text-primary" aria-hidden>
          <Salad className="size-6" />
        </span>
      </header>

      <section className="mx-auto max-w-5xl px-5 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-card via-card to-secondary p-6 shadow-xl sm:p-8">
          <div className="relative z-10 max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">
              Seu plano semanal
            </p>
            <h2 className="mt-2 text-2xl font-black text-foreground sm:text-3xl">
              Coma no tempo certo. Hidrate-se ao longo do dia.
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Organize recomendações por dia e deixe o FinNote lembrar os próximos horários.
            </p>
          </div>
          <div className="relative z-10 mt-6 flex flex-wrap gap-3">
            <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
              {draft.days.length} {draft.days.length === 1 ? "dia ativo" : "dias ativos"}
            </span>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold text-cyan-200">
              {mealCount} {mealCount === 1 ? "refeição" : "refeições"}
            </span>
          </div>
          <Salad
            className="absolute -bottom-8 -right-7 size-44 rotate-[-12deg] text-primary/5"
            aria-hidden
          />
        </div>

        {notificationStatus?.supported === false && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200">
              <Smartphone className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-black text-foreground">Avisos disponíveis no Android</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                No navegador você pode montar a dieta normalmente. Os lembretes em segundo plano
                serão entregues pelo aplicativo instalado no celular.
              </p>
            </div>
          </div>
        )}

        {notificationStatus?.supported && notificationStatus.display !== "granted" && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <BellRing className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-foreground">Autorize os lembretes</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Ative a permissão para receber água e refeições nos horários programados.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={requestingNotifications}
              onClick={handleEnableNotifications}
              className="shrink-0 rounded-xl"
            >
              {requestingNotifications ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                "Ativar"
              )}
            </Button>
          </div>
        )}

        <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.35fr)]">
          <section
            className="overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-card shadow-lg"
            aria-labelledby="water-title"
          >
            <div className="relative overflow-hidden border-b border-border bg-cyan-300/5 p-5">
              <div className="flex items-center justify-between gap-4">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-cyan-300/15 text-cyan-200">
                  <Droplets className="size-6" aria-hidden />
                </span>
                <Switch
                  checked={draft.waterRemindersEnabled}
                  onCheckedChange={(checked) => updateDraft({ waterRemindersEnabled: checked })}
                  aria-labelledby="water-title"
                />
              </div>
              <h2 id="water-title" className="mt-4 text-xl font-black text-foreground">
                Beba água
              </h2>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Lembretes diários somente dentro da sua janela de hidratação.
              </p>
              <Droplets
                className="absolute -bottom-7 -right-5 size-28 text-cyan-300/5"
                aria-hidden
              />
            </div>

            <fieldset
              disabled={!draft.waterRemindersEnabled}
              className="space-y-5 p-5 disabled:opacity-45"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="water-start">COMEÇA</Label>
                  <Input
                    id="water-start"
                    type="time"
                    value={draft.waterStartTime}
                    onChange={(event) => updateDraft({ waterStartTime: event.target.value })}
                    className="h-12 rounded-xl bg-background/55"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="water-end">TERMINA</Label>
                  <Input
                    id="water-end"
                    type="time"
                    value={draft.waterEndTime}
                    onChange={(event) => updateDraft({ waterEndTime: event.target.value })}
                    className="h-12 rounded-xl bg-background/55"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="water-interval">INTERVALO</Label>
                <Select
                  value={String(draft.waterIntervalMinutes)}
                  onValueChange={(value) => updateDraft({ waterIntervalMinutes: Number(value) })}
                >
                  <SelectTrigger id="water-interval" className="h-12 rounded-xl bg-background/55">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border bg-popover">
                    {WATER_INTERVALS.map((minutes) => (
                      <SelectItem
                        key={minutes}
                        value={String(minutes)}
                        className="rounded-lg py-2.5"
                      >
                        A cada {intervalLabel(minutes)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3 rounded-2xl bg-background/45 p-3">
                <Clock3 className="size-5 shrink-0 text-cyan-200" aria-hidden />
                <p className="text-xs leading-5 text-muted-foreground">
                  <strong className="text-foreground">
                    {waterSlots.length} {waterSlots.length === 1 ? "aviso" : "avisos"} por dia
                  </strong>
                  <br />
                  Todos os dias, de {draft.waterStartTime || "--:--"} até{" "}
                  {draft.waterEndTime || "--:--"}.
                </p>
              </div>
            </fieldset>
          </section>

          <section
            className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-lg"
            aria-labelledby="meals-title"
          >
            <div className="border-b border-border p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                    <UtensilsCrossed className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h2 id="meals-title" className="text-lg font-black text-foreground">
                      Refeições da semana
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Ative os dias e monte um cardápio para cada um.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Switch
                    checked={draft.mealRemindersEnabled}
                    onCheckedChange={(checked) => updateDraft({ mealRemindersEnabled: checked })}
                    aria-label="Ativar lembretes das refeições"
                  />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    Avisos
                  </span>
                </div>
              </div>

              <div
                className="mt-5 grid grid-cols-7 gap-1.5"
                role="tablist"
                aria-label="Dias da semana"
              >
                {WEEKDAYS.map((day) => {
                  const configuredDay = draft.days.find((item) => item.dayOfWeek === day.index);
                  const selected = selectedDay === day.index;
                  return (
                    <button
                      key={day.index}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-label={`${day.label}${configuredDay ? ", ativo" : ", inativo"}`}
                      onClick={() => setSelectedDay(day.index)}
                      className={cn(
                        "relative flex min-h-12 min-w-0 flex-col items-center justify-center rounded-xl border px-1 text-[9px] font-black tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : configuredDay
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border bg-background/40 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {day.short}
                      <span
                        className={cn(
                          "mt-1 size-1 rounded-full",
                          configuredDay
                            ? selected
                              ? "bg-primary-foreground"
                              : "bg-primary"
                            : "bg-transparent",
                        )}
                        aria-hidden
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-5 sm:p-6" role="tabpanel">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                    Cardápio do dia
                  </p>
                  <h3 className="mt-1 text-xl font-black text-foreground">
                    {selectedDayDetails.label}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden text-xs font-bold text-muted-foreground sm:inline">
                    {activeDay ? "Dia ativo" : "Dia inativo"}
                  </span>
                  <Switch
                    checked={Boolean(activeDay)}
                    onCheckedChange={(checked) => setDayEnabled(selectedDay, checked)}
                    aria-label={`${activeDay ? "Remover" : "Adicionar"} ${selectedDayDetails.label} na dieta`}
                  />
                </div>
              </div>

              {!activeDay ? (
                <div className="mt-6 rounded-3xl border border-dashed border-border bg-background/30 px-5 py-10 text-center">
                  <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Plus className="size-7" aria-hidden />
                  </span>
                  <p className="mt-4 font-black text-foreground">
                    Esse dia ainda não faz parte da dieta
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                    Ative {selectedDayDetails.label.toLowerCase()} para começar a adicionar
                    refeições.
                  </p>
                  <Button
                    type="button"
                    onClick={() => setDayEnabled(selectedDay, true)}
                    className="mt-5 h-11 rounded-xl font-bold"
                  >
                    <Check className="size-4" aria-hidden />
                    ATIVAR DIA
                  </Button>
                </div>
              ) : activeDay.meals.length === 0 ? (
                <div className="mt-6 rounded-3xl border border-dashed border-border bg-background/30 px-5 py-10 text-center">
                  <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <UtensilsCrossed className="size-7" aria-hidden />
                  </span>
                  <p className="mt-4 font-black text-foreground">Nenhuma refeição neste dia</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                    Cadastre o nome, o prato recomendado e o horário da primeira refeição.
                  </p>
                  <Button
                    type="button"
                    onClick={openCreateMeal}
                    className="mt-5 h-11 rounded-xl font-bold"
                  >
                    <Plus className="size-4" aria-hidden />
                    ADICIONAR REFEIÇÃO
                  </Button>
                </div>
              ) : (
                <>
                  <ul className="mt-6 space-y-3">
                    {[...activeDay.meals]
                      .sort((left, right) => left.mealTime.localeCompare(right.mealTime))
                      .map((meal) => (
                        <li
                          key={meal.key}
                          className="relative overflow-hidden rounded-3xl border border-border bg-background/45 p-4"
                        >
                          <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
                          <div className="flex items-start gap-3 pl-1">
                            <time
                              dateTime={meal.mealTime}
                              className="flex min-w-16 shrink-0 items-center gap-1.5 rounded-xl bg-primary/10 px-2.5 py-2 text-sm font-black tabular-nums text-primary"
                            >
                              <Clock3 className="size-3.5" aria-hidden />
                              {meal.mealTime}
                            </time>
                            <div className="min-w-0 flex-1">
                              <p className="font-black text-foreground">{meal.name}</p>
                              <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-muted-foreground">
                                {meal.dish}
                              </p>
                            </div>
                          </div>
                          <div className="mt-3 flex justify-end gap-1 border-t border-border pt-2">
                            <button
                              type="button"
                              onClick={() => openEditMeal(meal)}
                              aria-label={`Editar ${meal.name}`}
                              className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <Pencil className="size-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setMealToDelete({
                                  dayOfWeek: selectedDay,
                                  key: meal.key,
                                  name: meal.name,
                                })
                              }
                              aria-label={`Excluir ${meal.name}`}
                              className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </button>
                          </div>
                        </li>
                      ))}
                  </ul>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openCreateMeal}
                    className="mt-4 h-11 w-full rounded-xl border-dashed font-bold"
                  >
                    <Plus className="size-4" aria-hidden />
                    ADICIONAR OUTRA REFEIÇÃO
                  </Button>
                </>
              )}
            </div>
          </section>
        </div>

        {formError && (
          <p
            role="alert"
            className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {formError}
          </p>
        )}
      </section>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-5 py-3 backdrop-blur sm:px-6"
        style={{
          paddingBottom:
            "calc(0.75rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))",
        }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <p className="hidden text-xs font-bold text-muted-foreground sm:block">
            {isDirty
              ? "Existem alterações que ainda não foram salvas."
              : "Seu plano está atualizado."}
          </p>
          <Button
            type="button"
            disabled={!isDirty || saving}
            onClick={() => void handleSave()}
            className="h-12 w-full rounded-xl px-7 font-black sm:w-auto"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            {saving ? "SALVANDO..." : isDirty ? "SALVAR DIETA" : "TUDO SALVO"}
          </Button>
        </div>
      </div>

      <MealEditorDialog
        open={editorOpen}
        dayLabel={weekdayLabel(selectedDay)}
        meal={currentEditingMeal}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingMeal(null);
        }}
        onSave={handleMealSaved}
      />

      <AlertDialog
        open={Boolean(mealToDelete)}
        onOpenChange={(open) => !open && setMealToDelete(null)}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-3xl border-border bg-card sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir refeição?</AlertDialogTitle>
            <AlertDialogDescription>
              {mealToDelete
                ? `“${mealToDelete.name}” será removida do cardápio ao salvar a dieta.`
                : "A refeição será removida do cardápio."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMeal}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
