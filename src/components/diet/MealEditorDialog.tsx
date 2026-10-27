import { Clock3, Save, UtensilsCrossed } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

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
import { dietMealInputSchema, type DietMealInput } from "@/lib/diet";

type MealEditorDialogProps = {
  open: boolean;
  dayLabel: string;
  meal: DietMealInput | null;
  onOpenChange: (open: boolean) => void;
  onSave: (meal: DietMealInput) => void;
};

export function MealEditorDialog({
  open,
  dayLabel,
  meal,
  onOpenChange,
  onSave,
}: MealEditorDialogProps) {
  const [name, setName] = useState("");
  const [dish, setDish] = useState("");
  const [mealTime, setMealTime] = useState("12:00");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(meal?.name ?? "");
    setDish(meal?.dish ?? "");
    setMealTime(meal?.mealTime ?? "12:00");
    setFormError(null);
  }, [meal, open]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = dietMealInputSchema.safeParse({
      ...(meal?.id ? { id: meal.id } : {}),
      name,
      dish,
      mealTime,
    });

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Confira os dados da refeição.");
      return;
    }

    onSave(parsed.data);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-[2rem] border-border bg-card p-5 sm:max-w-lg sm:p-6">
        <DialogHeader className="pr-7 text-left">
          <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <UtensilsCrossed className="size-6" aria-hidden />
          </span>
          <DialogTitle className="text-xl font-black text-foreground">
            {meal ? "Editar refeição" : "Nova refeição"}
          </DialogTitle>
          <DialogDescription>
            Cardápio de {dayLabel.toLowerCase()}. O aviso usará o horário informado.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-1">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-2">
              <Label htmlFor="diet-meal-name">REFEIÇÃO</Label>
              <Input
                id="diet-meal-name"
                value={name}
                maxLength={80}
                autoFocus
                onChange={(event) => setName(event.target.value)}
                placeholder="Café da manhã"
                className="h-12 rounded-xl bg-background/60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="diet-meal-time">HORÁRIO</Label>
              <div className="relative">
                <Clock3
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="diet-meal-time"
                  type="time"
                  value={mealTime}
                  onChange={(event) => setMealTime(event.target.value)}
                  className="h-12 rounded-xl bg-background/60 pl-9"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="diet-meal-dish">PRATO RECOMENDADO</Label>
            <Textarea
              id="diet-meal-dish"
              value={dish}
              maxLength={500}
              rows={5}
              onChange={(event) => setDish(event.target.value)}
              placeholder="Ex.: arroz integral, frango grelhado e salada"
              className="min-h-32 resize-none rounded-xl bg-background/60"
            />
            <p className="text-right text-[11px] text-muted-foreground">{dish.length}/500</p>
          </div>

          {formError && (
            <p
              role="alert"
              className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" className="h-12 w-full rounded-xl font-black sm:w-auto">
              <Save className="size-4" aria-hidden />
              {meal ? "SALVAR ALTERAÇÃO" : "ADICIONAR REFEIÇÃO"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
