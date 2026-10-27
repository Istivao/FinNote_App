import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ListTodo,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { TaskEditorDialog } from "@/components/tasks/TaskEditorDialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  cancelTaskNotifications,
  getTaskNotificationPermissionStatus,
  reconcileTaskNotifications,
  requestTaskNotificationPermissions,
  type TaskNotificationPermissionStatus,
} from "@/lib/task-notifications";
import { deleteTask, listTasks, setTaskCompleted, type Task } from "@/lib/tasks";
import { formatTaskDeadline, TASK_PRIORITY_DETAILS } from "@/lib/task-ui";
import { cn } from "@/lib/utils";

const tasksQuery = queryOptions({ queryKey: ["tasks"], queryFn: listTasks });

export const Route = createFileRoute("/_authenticated/tarefas")({
  head: () => ({
    meta: [
      { title: "Tarefas | FinNote" },
      {
        name: "description",
        content: "Organize tarefas por prazo e prioridade e receba avisos no celular.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(tasksQuery),
  component: TasksPage,
  errorComponent: ({ error }) => (
    <main className="min-h-dvh bg-background px-5 py-10" role="alert">
      <div className="mx-auto max-w-lg rounded-3xl border border-destructive/30 bg-card p-6">
        <h1 className="text-lg font-black text-foreground">Não foi possível carregar as tarefas</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button asChild variant="outline" className="mt-5 rounded-xl">
          <Link to="/">Voltar para a Home</Link>
        </Button>
      </div>
    </main>
  ),
});

type TaskFilter = "overdue" | "todo" | "done";

function TaskCard({
  task,
  overdue,
  busy,
  onComplete,
  onEdit,
  onDelete,
}: {
  task: Task;
  overdue: boolean;
  busy: boolean;
  onComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  const completed = task.completedAt !== null;
  const priority = TASK_PRIORITY_DETAILS[task.priority];

  return (
    <li
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] border border-border bg-card p-4 shadow-lg sm:p-5",
        completed && "opacity-70",
      )}
      aria-busy={busy}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          task.priority === "urgent"
            ? "bg-red-400"
            : task.priority === "normal"
              ? "bg-primary"
              : "bg-cyan-300",
        )}
        aria-hidden
      />

      <div className="flex items-start gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onComplete(task)}
          aria-label={completed ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
          className={cn(
            "mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl border transition-colors disabled:pointer-events-none disabled:opacity-50",
            completed
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background/50 text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : completed ? (
            <RotateCcw className="size-5" aria-hidden />
          ) : (
            <Check className="size-5" aria-hidden />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]",
                priority.badgeClass,
              )}
            >
              {priority.label}
            </span>
            {overdue && !completed && (
              <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-red-300">
                <CircleAlert className="size-3.5" aria-hidden />
                Atrasada
              </span>
            )}
          </div>
          <h2
            className={cn(
              "mt-2 text-base font-black leading-6 text-card-foreground",
              completed && "line-through",
            )}
          >
            {task.title}
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-muted-foreground">
            {task.description}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <time
          dateTime={task.dueAt}
          className={cn(
            "flex items-center gap-1.5 text-xs font-bold",
            overdue && !completed ? "text-red-300" : "text-muted-foreground",
          )}
        >
          <CalendarClock className="size-4" aria-hidden />
          {formatTaskDeadline(task.dueAt)}
        </time>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => onEdit(task)}
            aria-label={`Editar ${task.title}`}
            className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:pointer-events-none disabled:opacity-50"
          >
            <Pencil className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(task)}
            aria-label={`Excluir ${task.title}`}
            className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}

function TaskList({
  tasks,
  filter,
  now,
  busyTaskId,
  onComplete,
  onEdit,
  onDelete,
  onCreate,
}: {
  tasks: Task[];
  filter: TaskFilter;
  now: number;
  busyTaskId: string | null;
  onComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onCreate: () => void;
}) {
  if (tasks.length === 0) {
    const content = {
      overdue: ["Nenhuma tarefa atrasada", "Os prazos vencidos aparecerão aqui."],
      todo: ["Nada na fila", "Crie uma tarefa e organize seu próximo prazo."],
      done: ["Nenhuma tarefa concluída", "As tarefas finalizadas ficarão guardadas aqui."],
    }[filter];

    return (
      <div className="rounded-[2rem] border border-dashed border-border bg-card/40 px-6 py-12 text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
          {filter === "done" ? (
            <CheckCircle2 className="size-8" aria-hidden />
          ) : (
            <ListTodo className="size-8" aria-hidden />
          )}
        </span>
        <h2 className="mt-5 text-lg font-black text-foreground">{content[0]}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{content[1]}</p>
        {filter === "todo" && (
          <Button type="button" onClick={onCreate} className="mt-5 rounded-xl font-bold">
            <Plus className="size-4" aria-hidden />
            Criar tarefa
          </Button>
        )}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          overdue={!task.completedAt && new Date(task.dueAt).getTime() < now}
          busy={busyTaskId === task.id}
          onComplete={onComplete}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

function TasksPage() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { data: tasks } = useSuspenseQuery(tasksQuery);
  const [filter, setFilter] = useState<TaskFilter>("todo");
  const [now, setNow] = useState(() => Date.now());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notificationStatus, setNotificationStatus] =
    useState<TaskNotificationPermissionStatus | null>(null);
  const [requestingNotifications, setRequestingNotifications] = useState(false);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    const timer = window.setInterval(updateNow, 60_000);
    document.addEventListener("visibilitychange", updateNow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", updateNow);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void getTaskNotificationPermissionStatus()
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

  const overdueTasks = tasks.filter(
    (task) => !task.completedAt && new Date(task.dueAt).getTime() < now,
  );
  const todoTasks = tasks.filter(
    (task) => !task.completedAt && new Date(task.dueAt).getTime() >= now,
  );
  const doneTasks = tasks
    .filter((task) => task.completedAt)
    .sort(
      (first, second) =>
        new Date(second.completedAt!).getTime() - new Date(first.completedAt!).getTime(),
    );

  async function refreshTasksAndNotifications(taskId?: string) {
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    try {
      if (taskId) await cancelTaskNotifications(user.id, taskId);
      await reconcileTaskNotifications(user.id);
      setNotificationStatus(await getTaskNotificationPermissionStatus());
    } catch {
      toast.warning("A tarefa foi salva, mas os avisos do celular não puderam ser atualizados.");
    }
  }

  function openCreate() {
    setEditingTask(null);
    setEditorOpen(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setEditorOpen(true);
  }

  async function handleComplete(task: Task) {
    const completed = !task.completedAt;
    setBusyTaskId(task.id);
    try {
      await setTaskCompleted(task.id, completed);
      await refreshTasksAndNotifications(task.id);
      toast.success(completed ? "Tarefa concluída." : "Tarefa reaberta.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a tarefa.");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleDelete() {
    if (!taskToDelete) return;
    setDeleting(true);
    try {
      await deleteTask(taskToDelete.id);
      await refreshTasksAndNotifications(taskToDelete.id);
      toast.success("Tarefa excluída.");
      setTaskToDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a tarefa.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleEnableNotifications() {
    setRequestingNotifications(true);
    try {
      const status = await requestTaskNotificationPermissions();
      setNotificationStatus(status);
      if (status.display !== "granted") {
        toast.error("Permita as notificações nas configurações do celular.");
        return;
      }
      await reconcileTaskNotifications(user.id);
      toast.success(
        status.exact === "granted"
          ? "Notificações ativadas."
          : "Notificações ativadas, mas o horário pode variar.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ativar os avisos.");
    } finally {
      setRequestingNotifications(false);
    }
  }

  const notificationNeedsAttention =
    notificationStatus?.supported &&
    (notificationStatus.display !== "granted" || notificationStatus.exact !== "granted");

  return (
    <main className="relative min-h-dvh bg-background pb-32" aria-label="Tarefas">
      <header className="mx-auto grid max-w-4xl grid-cols-[2.5rem_1fr_2.5rem] items-center gap-3 px-5 pb-6 pt-6 sm:px-6">
        <Link
          to="/"
          aria-label="Voltar para a Home"
          className="flex size-10 items-center justify-center rounded-full bg-surface-inactive text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-black tracking-[0.32em] text-primary">ORGANIZE O DIA</p>
          <h1 className="truncate text-xl font-black tracking-[0.2em] text-foreground">TAREFAS</h1>
        </div>
        <span className="flex size-10 items-center justify-center text-primary" aria-hidden>
          <ListTodo className="size-6" />
        </span>
      </header>

      <section className="mx-auto max-w-4xl px-5 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-card via-card to-secondary p-5 shadow-xl sm:p-7">
          <div className="relative z-10 flex items-end justify-between gap-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
                Próximos passos
              </p>
              <p className="mt-2 text-4xl font-black tabular-nums text-foreground">
                {todoTasks.length}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {todoTasks.length === 1 ? "tarefa no prazo" : "tarefas no prazo"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black tabular-nums text-red-300">{overdueTasks.length}</p>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                atrasadas
              </p>
            </div>
          </div>
          <Clock3 className="absolute -right-5 -top-6 size-32 text-primary/5" aria-hidden />
        </div>

        {notificationNeedsAttention && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <BellRing className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-foreground">Ative os avisos no celular</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Autorize notificações e alarmes para receber os lembretes no horário.
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

        <Tabs
          value={filter}
          onValueChange={(value) => setFilter(value as TaskFilter)}
          className="mt-6"
        >
          <TabsList className="grid h-14 w-full grid-cols-3 rounded-2xl bg-surface-inactive p-1.5">
            <TabsTrigger value="overdue" className="h-full gap-1 rounded-xl text-xs font-black">
              Atrasadas
              <span className="rounded-full bg-background/50 px-1.5 py-0.5 text-[10px]">
                {overdueTasks.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="todo" className="h-full gap-1 rounded-xl text-xs font-black">
              A fazer
              <span className="rounded-full bg-background/50 px-1.5 py-0.5 text-[10px]">
                {todoTasks.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="done" className="h-full gap-1 rounded-xl text-xs font-black">
              Feitas
              <span className="rounded-full bg-background/50 px-1.5 py-0.5 text-[10px]">
                {doneTasks.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overdue" className="mt-4">
            <TaskList
              tasks={overdueTasks}
              filter="overdue"
              now={now}
              busyTaskId={busyTaskId}
              onComplete={handleComplete}
              onEdit={openEdit}
              onDelete={setTaskToDelete}
              onCreate={openCreate}
            />
          </TabsContent>
          <TabsContent value="todo" className="mt-4">
            <TaskList
              tasks={todoTasks}
              filter="todo"
              now={now}
              busyTaskId={busyTaskId}
              onComplete={handleComplete}
              onEdit={openEdit}
              onDelete={setTaskToDelete}
              onCreate={openCreate}
            />
          </TabsContent>
          <TabsContent value="done" className="mt-4">
            <TaskList
              tasks={doneTasks}
              filter="done"
              now={now}
              busyTaskId={busyTaskId}
              onComplete={handleComplete}
              onEdit={openEdit}
              onDelete={setTaskToDelete}
              onCreate={openCreate}
            />
          </TabsContent>
        </Tabs>
      </section>

      <button
        type="button"
        aria-label="Criar tarefa"
        onClick={openCreate}
        className="fixed right-5 z-30 flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background active:scale-95"
        style={{
          bottom: "calc(1.5rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))",
        }}
      >
        <Plus className="size-8" aria-hidden />
      </button>

      <TaskEditorDialog
        open={editorOpen}
        task={editingTask}
        onOpenChange={setEditorOpen}
        onSaved={(task) => refreshTasksAndNotifications(task.id)}
      />

      <AlertDialog
        open={Boolean(taskToDelete)}
        onOpenChange={(open) => !open && !deleting && setTaskToDelete(null)}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] rounded-3xl border-border bg-card sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              {taskToDelete
                ? `“${taskToDelete.title}” será removida e seus avisos serão cancelados.`
                : "A tarefa será removida."}
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
