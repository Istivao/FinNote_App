import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { workoutTypeIcon } from "@/lib/workout-ui";
import {
  WORKOUT_KINDS,
  createWorkoutType,
  type WorkoutKind,
  type WorkoutType,
} from "@/lib/workout-types";

type NewWorkoutTypeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingNames: string[];
  onCreated?: (type: WorkoutType) => void;
};

const KIND_HINTS: Record<WorkoutKind, string> = {
  gym: "Séries, repetições, peso e descanso",
  run: "Blocos com intensidade, volume e intervalo",
};

export function NewWorkoutTypeDialog({
  open,
  onOpenChange,
  existingNames,
  onCreated,
}: NewWorkoutTypeDialogProps) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<WorkoutKind>("gym");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const existing = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const kindLabel = WORKOUT_KINDS.find((option) => option.value === kind)!.label;

  function reset() {
    setKind("gym");
    setName("");
  }

  function handleOpenChange(next: boolean) {
    if (saving) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Sem nome, o tipo leva o nome do formulário ("Academia", "Corrida").
    const typeName = name.trim() || kindLabel;
    if (existing.has(typeName.toLowerCase())) {
      toast.error(`Você já tem o tipo "${typeName}". Dê outro nome.`);
      return;
    }

    setSaving(true);
    try {
      const created = await createWorkoutType(typeName, kind);
      await queryClient.invalidateQueries({ queryKey: ["workout-types"] });
      toast.success(`Tipo "${created.name}" criado!`);
      reset();
      onOpenChange(false);
      onCreated?.(created);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o tipo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle>Novo tipo de treino</DialogTitle>
          <DialogDescription>O formulário define como os treinos são montados.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset className="grid grid-cols-2 gap-2" disabled={saving}>
            <legend className="sr-only">Formulário</legend>
            {WORKOUT_KINDS.map((option) => {
              const active = option.value === kind;
              const Icon = workoutTypeIcon(option.label);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setKind(option.value)}
                  className={`flex flex-col items-start gap-2 rounded-2xl border p-3 text-left transition-colors ${
                    active ? "border-primary bg-primary/10" : "border-border bg-card"
                  }`}
                >
                  <Icon className="size-5 text-primary" aria-hidden />
                  <span className="text-sm font-bold text-foreground">{option.label}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    {KIND_HINTS[option.value]}
                  </span>
                </button>
              );
            })}
          </fieldset>

          <Input
            value={name}
            maxLength={40}
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
            placeholder={`Nome do tipo (padrão: ${kindLabel})`}
            aria-label="Nome do tipo de treino"
            className="h-12 rounded-xl bg-card"
          />

          <Button type="submit" disabled={saving} className="h-12 w-full rounded-2xl font-black">
            {saving && <Loader2 className="size-5 animate-spin" aria-hidden />}
            CRIAR TIPO
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
