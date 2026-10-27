import { Plus, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { newGymExercise, type GymExerciseDraft } from "@/lib/workout-drafts";
import { CATEGORIES } from "@/lib/workout-ui";
import { MAX_REPS, MAX_SETS } from "@/lib/workouts";

const MAX_EXERCISES = 40;

type GymExerciseFormProps = {
  exercises: GymExerciseDraft[];
  onChange: (update: (current: GymExerciseDraft[]) => GymExerciseDraft[]) => void;
};

export function GymExerciseForm({ exercises, onChange }: GymExerciseFormProps) {
  function updateExercise(key: string, patch: Partial<GymExerciseDraft>) {
    onChange((current) =>
      current.map((exercise) => (exercise.key === key ? { ...exercise, ...patch } : exercise)),
    );
  }

  return (
    <div className="space-y-8">
      {CATEGORIES.map((category) => {
        const items = exercises.filter((exercise) => exercise.category === category.value);
        return (
          <section key={category.value} className="space-y-3">
            <h2 className="text-sm font-black tracking-[0.15em] text-primary">{category.label}</h2>

            {items.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum item nesta categoria.</p>
            )}

            {items.map((exercise, index) => (
              <div key={exercise.key} className="rounded-3xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-black text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remover item ${index + 1} de ${category.label}`}
                    onClick={() =>
                      onChange((current) => current.filter((item) => item.key !== exercise.key))
                    }
                    className="flex size-9 items-center justify-center rounded-full bg-surface-inactive text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor={`name-${exercise.key}`}>NOME</Label>
                    <Input
                      id={`name-${exercise.key}`}
                      value={exercise.name}
                      maxLength={80}
                      onChange={(event) =>
                        updateExercise(exercise.key, { name: event.target.value })
                      }
                      placeholder="Supino reto"
                      className="h-11 rounded-xl bg-surface-inactive"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField
                      id={`sets-${exercise.key}`}
                      label="SÉRIES"
                      value={exercise.sets}
                      max={MAX_SETS}
                      placeholder="3"
                      onChange={(sets) => updateExercise(exercise.key, { sets })}
                    />
                    <NumberField
                      id={`reps-${exercise.key}`}
                      label="REPETIÇÕES"
                      value={exercise.reps}
                      max={MAX_REPS}
                      placeholder="12"
                      onChange={(reps) => updateExercise(exercise.key, { reps })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField
                      id={`weight-${exercise.key}`}
                      label="PESO (KG)"
                      value={exercise.weightKg}
                      min={0}
                      max={999}
                      step={0.5}
                      decimal
                      placeholder="Opcional"
                      onChange={(weightKg) => updateExercise(exercise.key, { weightKg })}
                    />
                    <NumberField
                      id={`rest-${exercise.key}`}
                      label="DESCANSO (MIN)"
                      value={exercise.restMinutes}
                      min={0}
                      max={30}
                      step={0.5}
                      decimal
                      placeholder="1"
                      onChange={(restMinutes) => updateExercise(exercise.key, { restMinutes })}
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              disabled={exercises.length >= MAX_EXERCISES}
              onClick={() => onChange((current) => [...current, newGymExercise(category.value)])}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-4 text-sm font-semibold text-muted-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden />
              Adicionar em {category.label.toLowerCase()}
            </button>
          </section>
        );
      })}
    </div>
  );
}

type NumberFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  min?: number;
  max: number;
  step?: number;
  decimal?: boolean;
};

export function NumberField({
  id,
  label,
  value,
  onChange,
  placeholder,
  min = 1,
  max,
  step = 1,
  decimal = false,
}: NumberFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode={decimal ? "decimal" : "numeric"}
        min={min}
        max={max}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-xl bg-surface-inactive"
      />
    </div>
  );
}
