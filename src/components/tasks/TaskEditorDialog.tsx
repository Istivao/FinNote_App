import { CalendarClock, Loader2, Save } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { createTask, taskInputSchema, updateTask, type Task, type TaskPriority } from "@/lib/tasks";
import {
  TASK_PRIORITY_DETAILS,
  taskDateInputValue,
  taskDeadlineIso,
  taskTimeInputValue,
} from "@/lib/task-ui";
import { cn } from "@/lib/utils";

type TaskEditorDialogProps = {
  open: boolean;
  task: Task | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (task: Task) => Promise<void>;
};

function defaultDeadline() {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 1);
  deadline.setHours(18, 0, 0, 0);
  return deadline;
}

export function TaskEditorDialog({ open, task, onOpenChange, onSaved }: TaskEditorDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const deadline = task ? new Date(task.dueAt) : defaultDeadline();
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setPriority(task?.priority ?? "normal");
    setDueDate(taskDateInputValue(deadline));
    setDueTime(taskTimeInputValue(deadline));
    setFormError(null);
  }, [open, task]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dueAt = taskDeadlineIso(dueDate, dueTime);
    const parsed = taskInputSchema.safeParse({ title, description, priority, dueAt });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Confira os dados da tarefa.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const savedTask = task
        ? await updateTask(task.id, parsed.data)
        : await createTask(parsed.data);
      await onSaved(savedTask);
      toast.success(task ? "Tarefa atualizada." : "Tarefa criada.");
      onOpenChange(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar a tarefa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !saving && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-[2rem] border-border bg-card p-5 sm:max-w-lg sm:p-6">
        <DialogHeader className="pr-7 text-left">
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <CalendarClock className="size-6" aria-hidden />
          </span>
          <DialogTitle className="text-xl font-black text-foreground">
            {task ? "Editar tarefa" : "Nova tarefa"}
          </DialogTitle>
          <DialogDescription>
            Defina o prazo e a prioridade. Os avisos anteriores chegam às 9h.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-1">
          <fieldset disabled={saving} className="space-y-5 disabled:opacity-70">
            <div className="space-y-2">
              <Label htmlFor="task-title">TÍTULO</Label>
              <Input
                id="task-title"
                value={title}
                maxLength={80}
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Entregar relatório"
                className="h-12 rounded-xl bg-background/60"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-description">DESCRIÇÃO</Label>
              <Textarea
                id="task-description"
                value={description}
                maxLength={500}
                rows={4}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Explique o que precisa ser feito..."
                className="min-h-28 resize-none rounded-xl bg-background/60"
              />
              <p className="text-right text-[11px] text-muted-foreground">
                {description.length}/500
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">PRIORIDADE</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(TASK_PRIORITY_DETAILS) as TaskPriority[]).map((value) => {
                  const details = TASK_PRIORITY_DETAILS[value];
                  const active = priority === value;
                  return (
                    <label
                      key={value}
                      className={cn(
                        "cursor-pointer rounded-2xl border p-3 transition-colors",
                        active
                          ? details.badgeClass
                          : "border-border bg-background/40 text-muted-foreground",
                      )}
                    >
                      <input
                        type="radio"
                        name="task-priority"
                        value={value}
                        checked={active}
                        onChange={() => setPriority(value)}
                        className="sr-only"
                      />
                      <span className="block text-sm font-black">{details.label}</span>
                      <span className="mt-1 block text-[10px] leading-4">{details.reminder}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <div className="space-y-2">
                <Label htmlFor="task-due-date">DATA FINAL</Label>
                <Input
                  id="task-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="h-12 rounded-xl bg-background/60"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-due-time">HORÁRIO</Label>
                <Input
                  id="task-due-time"
                  type="time"
                  value={dueTime}
                  onChange={(event) => setDueTime(event.target.value)}
                  className="h-12 rounded-xl bg-background/60"
                />
              </div>
            </div>
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
              {task ? "SALVAR ALTERAÇÕES" : "CRIAR TAREFA"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
