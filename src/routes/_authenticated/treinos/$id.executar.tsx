import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Clock,
  Flag,
  ListChecks,
  Pause,
  Play,
  SkipForward,
  Timer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RunSession } from "@/components/workouts/RunSession";
import { SessionStat } from "@/components/workouts/SessionStat";
import { CATEGORIES, categoryLabel, formatTime, workoutIcon } from "@/lib/workout-ui";
import { MAX_SETS, getWorkout, type Workout, type WorkoutExercise } from "@/lib/workouts";

// lottie-web é pesado: fica num chunk próprio, pré-carregado quando a sessão começa.
const loadStreakCelebration = () => import("@/components/workouts/StreakCelebration");
const StreakCelebration = lazy(loadStreakCelebration);

const workoutQuery = (id: string) =>
  queryOptions({
    queryKey: ["workout", id],
    queryFn: () => getWorkout(id),
  });

export const Route = createFileRoute("/_authenticated/treinos/$id/executar")({
  head: () => ({
    meta: [
      { title: "Executar treino | FinNote" },
      {
        name: "description",
        content:
          "Execute seu treino exercício por exercício, marcando séries concluídas, repetições, peso e descanso.",
      },
      { property: "og:title", content: "Executar treino | FinNote" },
      { property: "og:description", content: "Séries, repetições, peso e descanso em tempo real." },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(workoutQuery(params.id)),
  component: WorkoutSession,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6 text-sm text-muted-foreground">
      Não foi possível carregar o treino: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-6 text-muted-foreground">Treino não encontrado.</div>,
});

type SetEntry = { done: boolean; reps: string; weight: string };
type ExerciseOutcome = "completed" | "skipped";
type ExerciseStatus = "Atual" | "A seguir" | "Adiado" | "Concluído" | "Pulado";

function setCount(sets: number) {
  return Math.min(MAX_SETS, Math.max(1, Number.isInteger(sets) ? sets : 3));
}

function createEntries(exercise: WorkoutExercise): SetEntry[] {
  return Array.from({ length: setCount(exercise.sets) }, () => ({
    done: false,
    reps: String(exercise.reps),
    weight: exercise.weightKg === null ? "" : String(exercise.weightKg),
  }));
}

function ScrollingExerciseName({ name }: { name: string }) {
  const viewportRef = useRef<HTMLHeadingElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) return;

    function measureOverflow() {
      const currentViewport = viewportRef.current;
      const currentText = textRef.current;
      if (!currentViewport || !currentText) return;

      const distance = Math.max(0, currentText.scrollWidth - currentViewport.clientWidth);
      setOverflowDistance(distance > 1 ? distance : 0);
    }

    measureOverflow();
    const resizeObserver = new ResizeObserver(measureOverflow);
    resizeObserver.observe(viewport);
    resizeObserver.observe(text);

    return () => resizeObserver.disconnect();
  }, [name]);

  const shouldScroll = overflowDistance > 0;
  const animationStyle = shouldScroll
    ? ({
        "--exercise-name-offset": `-${overflowDistance}px`,
        "--exercise-name-duration": `${Math.max(7, overflowDistance / 24).toFixed(2)}s`,
      } as CSSProperties)
    : undefined;

  return (
    <h2 ref={viewportRef} className="overflow-hidden text-lg font-bold text-card-foreground">
      <span
        ref={textRef}
        className={`exercise-name-text${shouldScroll ? " exercise-name-marquee" : ""}`}
        style={animationStyle}
      >
        {name}
      </span>
    </h2>
  );
}

/** Escolhe o Modo Execução conforme o formulário do tipo do treino. */
function WorkoutSession() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: workout } = useSuspenseQuery(workoutQuery(id));

  if (!workout) {
    return <div className="p-6 text-muted-foreground">Treino não encontrado.</div>;
  }

  if (workout.kind === "run") {
    return (
      <RunSession
        workout={workout}
        onExit={() => navigate({ to: "/treinos/$id", params: { id } })}
        onFinish={() =>
          navigate({ to: "/treinos/tipo/$tipoId", params: { tipoId: workout.workoutTypeId } })
        }
      />
    );
  }

  return <GymSession workout={workout} />;
}

function GymSession({ workout }: { workout: Workout }) {
  const id = workout.id;
  const navigate = useNavigate();

  const exercises = useMemo(() => {
    const order = CATEGORIES.map((c) => c.value) as string[];
    return [...workout.exercises].sort(
      (a, b) => order.indexOf(a.category) - order.indexOf(b.category),
    );
  }, [workout]);

  const [pendingExerciseIds, setPendingExerciseIds] = useState(() =>
    exercises.map((exercise) => exercise.id),
  );
  const [deferredExerciseIds, setDeferredExerciseIds] = useState<Set<string>>(() => new Set());
  const [exerciseOutcomes, setExerciseOutcomes] = useState<Record<string, ExerciseOutcome>>(
    () => ({}),
  );
  const [finishedDuration, setFinishedDuration] = useState<number | null>(null);
  const [showStreakCelebration, setShowStreakCelebration] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [rest, setRest] = useState<number | null>(null);
  const [restRunning, setRestRunning] = useState(true);
  const [logs, setLogs] = useState<Record<string, SetEntry[]>>(() => ({}));
  const startedAt = useRef(Date.now());

  useEffect(() => {
    void loadStreakCelebration();
  }, []);

  useEffect(() => {
    if (finishedDuration !== null) return;
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [finishedDuration]);

  useEffect(() => {
    if (rest === null || !restRunning) return;
    const t = setInterval(() => {
      setRest((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [rest, restRunning]);

  useEffect(() => {
    if (finishedDuration !== null) return;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [finishedDuration]);

  function stopRest() {
    setRest(null);
    setRestRunning(false);
  }

  function finishWorkout() {
    if (finishedDuration !== null) return;
    const duration = Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000));
    stopRest();
    setElapsed(duration);
    setFinishedDuration(duration);
    // Simula o aumento da ofensiva até existir a contagem real de streaks.
    setShowStreakCelebration(true);
  }

  if (exercises.length === 0) {
    return (
      <div className="p-6 text-muted-foreground">
        Este treino não possui exercícios cadastrados.
      </div>
    );
  }

  const currentExerciseId = pendingExerciseIds[0];
  const exercise = exercises.find((item) => item.id === currentExerciseId) ?? exercises[0]!;
  const entries = logs[exercise.id] ?? createEntries(exercise);

  const activeIndex = entries.findIndex((e) => !e.done);
  const allDone = activeIndex === -1;
  const isLastExercise = pendingExerciseIds.length === 1;

  function updateEntry(index: number, patch: Partial<SetEntry>) {
    setLogs((prev) => {
      const list = (prev[exercise.id] ?? entries).map((e, i) =>
        i === index ? { ...e, ...patch } : e,
      );
      return { ...prev, [exercise.id]: list };
    });
  }

  function resolveCurrentExercise(outcome: ExerciseOutcome) {
    stopRest();
    setExerciseOutcomes((previous) => ({ ...previous, [exercise.id]: outcome }));
    if (isLastExercise) {
      finishWorkout();
      return;
    }
    setPendingExerciseIds((queue) => queue.slice(1));
  }

  function completeCurrentExercise() {
    resolveCurrentExercise("completed");
  }

  function skipCurrentExercise() {
    resolveCurrentExercise(allDone ? "completed" : "skipped");
  }

  function deferCurrentExercise() {
    if (isLastExercise) return;
    stopRest();
    setDeferredExerciseIds((previous) => new Set(previous).add(exercise.id));
    setPendingExerciseIds(([currentId, ...remaining]) =>
      currentId ? [...remaining, currentId] : remaining,
    );
  }

  function concludeSet(index: number) {
    setLogs((prev) => {
      const list = (prev[exercise.id] ?? entries).map((entry) => ({ ...entry }));
      const currentEntry = list[index];
      if (!currentEntry) return prev;

      list[index] = { ...currentEntry, done: true };
      const nextEntry = list[index + 1];
      if (nextEntry && nextEntry.weight === "") {
        list[index + 1] = { ...nextEntry, weight: currentEntry.weight };
      }

      return { ...prev, [exercise.id]: list };
    });
    setRest(Math.max(5, Math.round((exercise.restMinutes ?? 1) * 60)));
    setRestRunning(true);
  }

  function endRest() {
    setRest(null);
    if (entries.every((e) => e.done)) completeCurrentExercise();
  }

  function leave() {
    if (window.confirm("Sair do treino? O progresso desta sessão não será salvo.")) {
      navigate({ to: "/treinos/$id", params: { id } });
    }
  }

  if (finishedDuration !== null) {
    const allEntries = Object.values(logs).flat();
    const doneSets = allEntries.filter((e) => e.done);
    const volume = doneSets.reduce(
      (acc, e) => acc + (parseFloat(e.reps) || 0) * (parseFloat(e.weight.replace(",", ".")) || 0),
      0,
    );
    const doneExercises = exercises.filter((ex) => {
      const exerciseEntries = logs[ex.id] ?? [];
      return exerciseEntries.length > 0 && exerciseEntries.every((entry) => entry.done);
    }).length;

    return (
      <div className="min-h-screen bg-background px-5 pb-16 pt-10">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Flag className="size-8" aria-hidden />
        </span>
        <h1 className="mt-6 text-2xl font-black uppercase tracking-[0.1em] text-foreground">
          Treino finalizado
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{workout.name}</p>

        <dl className="mt-8 grid grid-cols-2 gap-3">
          <SessionStat label="Tempo total" value={formatTime(finishedDuration)} />
          <SessionStat label="Exercícios" value={`${doneExercises}/${exercises.length}`} />
          <SessionStat label="Séries feitas" value={String(doneSets.length)} />
          <SessionStat label="Volume aprox." value={`${Math.round(volume)} kg`} />
        </dl>

        <Button
          className="mt-10 h-14 w-full rounded-2xl text-base font-black tracking-[0.1em]"
          onClick={() =>
            navigate({ to: "/treinos/tipo/$tipoId", params: { tipoId: workout.workoutTypeId } })
          }
        >
          VOLTAR AOS TREINOS
        </Button>

        {showStreakCelebration && (
          <Suspense fallback={null}>
            <StreakCelebration onFinish={() => setShowStreakCelebration(false)} />
          </Suspense>
        )}
      </div>
    );
  }

  const Icon = workoutIcon(workout.name);
  const resolvedExercises = exercises.length - pendingExerciseIds.length;
  const progress = (resolvedExercises / exercises.length) * 100;

  function renderExerciseRow(item: (typeof exercises)[number], status: ExerciseStatus) {
    const itemEntries = logs[item.id] ?? [];
    const completedSets = itemEntries.filter((entry) => entry.done).length;
    const totalSets = itemEntries.length || setCount(item.sets);
    const originalNumber = exercises.findIndex((candidate) => candidate.id === item.id) + 1;
    const statusClass =
      status === "Atual"
        ? "bg-primary text-primary-foreground"
        : status === "Concluído"
          ? "bg-primary/10 text-primary"
          : status === "Pulado"
            ? "bg-destructive/10 text-destructive"
            : "bg-surface-inactive text-muted-foreground";

    return (
      <li
        key={item.id}
        className="flex items-start gap-3 rounded-2xl border border-border bg-background/60 p-3"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-inactive text-xs font-black text-foreground">
          {String(originalNumber).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-primary">
            {categoryLabel(item.category)}
          </p>
          <p className="truncate text-sm font-bold text-foreground">{item.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.sets} × {item.reps} · {completedSets}/{totalSets} séries
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-black ${statusClass}`}
        >
          {status}
        </span>
      </li>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="px-5 pt-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={leave}
            aria-label="Sair do treino"
            className="flex size-10 items-center justify-center rounded-full bg-surface-inactive text-foreground"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-black uppercase tracking-[0.1em] text-foreground">
              {workout.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              Exercício {Math.min(resolvedExercises + 1, exercises.length)} de {exercises.length} ·{" "}
              {formatTime(elapsed)}
            </p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label="Ver exercícios do treino"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-inactive text-foreground"
              >
                <ListChecks className="size-5" aria-hidden />
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-3xl border-border bg-card p-0 sm:max-w-xl">
              <DialogHeader className="p-5 pr-12 text-left">
                <DialogTitle>Exercícios do treino</DialogTitle>
                <DialogDescription>
                  Ordem atual da fila e progresso de cada exercício.
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 overflow-y-auto px-5 pb-5">
                <section aria-labelledby="pending-exercises-title">
                  <h2
                    id="pending-exercises-title"
                    className="mb-2 text-xs font-black uppercase tracking-[0.15em] text-muted-foreground"
                  >
                    Agora e próximos
                  </h2>
                  <ul className="space-y-2">
                    {pendingExerciseIds.map((exerciseId, index) => {
                      const item = exercises.find((candidate) => candidate.id === exerciseId);
                      if (!item) return null;

                      const status: ExerciseStatus =
                        index === 0
                          ? "Atual"
                          : deferredExerciseIds.has(exerciseId)
                            ? "Adiado"
                            : "A seguir";
                      return renderExerciseRow(item, status);
                    })}
                  </ul>
                </section>

                {Object.keys(exerciseOutcomes).length > 0 && (
                  <section className="mt-5" aria-labelledby="resolved-exercises-title">
                    <h2
                      id="resolved-exercises-title"
                      className="mb-2 text-xs font-black uppercase tracking-[0.15em] text-muted-foreground"
                    >
                      Concluídos e pulados
                    </h2>
                    <ul className="space-y-2">
                      {exercises.map((item) => {
                        const outcome = exerciseOutcomes[item.id];
                        if (!outcome) return null;
                        return renderExerciseRow(
                          item,
                          outcome === "completed" ? "Concluído" : "Pulado",
                        );
                      })}
                    </ul>
                  </section>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-inactive">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <section className="mt-6 px-5">
        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="flex items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-inactive text-primary">
              <Icon className="size-6" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black tracking-[0.15em] text-primary">
                {categoryLabel(exercise.category)}
              </p>
              <ScrollingExerciseName key={exercise.id} name={exercise.name} />
              <p className="text-xs text-muted-foreground">
                Planejado: {exercise.sets} × {exercise.reps}
                {exercise.weightKg !== null && ` · ${exercise.weightKg} kg`}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-5 text-xs font-black tracking-[0.15em] text-muted-foreground">
          SÉRIE {Math.min(allDone ? entries.length : activeIndex + 1, entries.length)} DE{" "}
          {entries.length}
        </p>

        {rest !== null ? (
          <div className="mt-3 rounded-3xl border border-primary/40 bg-card p-6 text-center">
            <Timer className="mx-auto size-6 text-primary" aria-hidden />
            <p className="mt-2 text-xs font-black tracking-[0.15em] text-muted-foreground">
              DESCANSO
            </p>
            <p className="mt-1 text-5xl font-black tabular-nums text-foreground">
              {formatTime(rest)}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRest((r) => Math.max(0, (r ?? 0) - 15))}
              >
                -15s
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRest((r) => (r ?? 0) + 15)}
              >
                +15s
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={restRunning ? "Pausar descanso" : "Retomar descanso"}
                onClick={() => setRestRunning((v) => !v)}
              >
                {restRunning ? (
                  <Pause className="size-4" aria-hidden />
                ) : (
                  <Play className="size-4" aria-hidden />
                )}
              </Button>
            </div>
            <Button
              type="button"
              className="mt-4 h-12 w-full rounded-2xl font-black tracking-[0.08em]"
              onClick={endRest}
            >
              {entries.every((e) => e.done)
                ? isLastExercise
                  ? "FINALIZAR TREINO"
                  : "PRÓXIMO EXERCÍCIO"
                : "INICIAR PRÓXIMA SÉRIE"}
            </Button>
          </div>
        ) : allDone ? (
          <div className="mt-3 rounded-3xl border border-primary bg-primary/10 p-6 text-center">
            <Check className="mx-auto size-6 text-primary" aria-hidden />
            <p className="mt-2 text-sm text-foreground">Exercício concluído.</p>
            <Button
              type="button"
              className="mt-4 h-12 w-full rounded-2xl font-black tracking-[0.08em]"
              onClick={completeCurrentExercise}
            >
              {isLastExercise ? "FINALIZAR TREINO" : "PRÓXIMO EXERCÍCIO"}
            </Button>
          </div>
        ) : (
          <div className="mt-3 rounded-3xl border border-border bg-card p-5">
            <div className="flex gap-3">
              <label className="flex-1 text-xs text-muted-foreground">
                Repetições
                <Input
                  inputMode="numeric"
                  placeholder={String(exercise.reps)}
                  value={entries[activeIndex]!.reps}
                  onChange={(e) => updateEntry(activeIndex, { reps: e.target.value })}
                  className="mt-1 h-12 rounded-xl text-base"
                />
              </label>
              <label className="flex-1 text-xs text-muted-foreground">
                Peso (kg)
                <Input
                  inputMode="decimal"
                  placeholder="0"
                  value={entries[activeIndex]!.weight}
                  onChange={(e) => updateEntry(activeIndex, { weight: e.target.value })}
                  className="mt-1 h-12 rounded-xl text-base"
                />
              </label>
            </div>
            <Button
              type="button"
              className="mt-4 h-12 w-full rounded-2xl font-black tracking-[0.08em]"
              onClick={() => concludeSet(activeIndex)}
            >
              <Check className="size-4" aria-hidden />
              CONCLUIR SÉRIE {activeIndex + 1}
            </Button>
          </div>
        )}

        {entries.some((e) => e.done) && (
          <ul className="mt-4 space-y-2">
            {entries.map((entry, index) =>
              entry.done ? (
                <li
                  key={index}
                  className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 px-4 py-2 text-sm text-foreground"
                >
                  <span className="font-black text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{entry.reps || "—"} reps</span>
                  <span className="text-muted-foreground">·</span>
                  <span>{entry.weight ? `${entry.weight} kg` : "sem peso"}</span>
                  <Check className="ml-auto size-4 text-primary" aria-hidden />
                </li>
              ) : null,
            )}
          </ul>
        )}
      </section>

      <footer className="fixed inset-x-0 bottom-0 flex gap-3 border-t border-border bg-background/95 p-4 backdrop-blur">
        <Button
          type="button"
          variant="outline"
          className="h-12 flex-1 rounded-2xl"
          onClick={skipCurrentExercise}
        >
          <SkipForward className="size-4" aria-hidden />
          Pular exercício
        </Button>
        {!isLastExercise ? (
          <Button
            type="button"
            className="h-12 flex-1 rounded-2xl font-black tracking-[0.08em]"
            onClick={deferCurrentExercise}
          >
            <Clock className="size-4" aria-hidden />
            Fazer depois
          </Button>
        ) : (
          <Button
            type="button"
            className="h-12 flex-1 rounded-2xl font-black tracking-[0.08em]"
            onClick={skipCurrentExercise}
          >
            FINALIZAR TREINO
          </Button>
        )}
      </footer>
    </div>
  );
}
