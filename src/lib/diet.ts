import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

const hhmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use um horário no formato HH:mm.");

const mealIdSchema = z.string().trim().uuid("O ID da refeição deve ser um UUID válido.");

export const dietMealInputSchema = z
  .object({
    id: mealIdSchema.optional(),
    name: z
      .string()
      .trim()
      .min(1, "Informe o nome da refeição.")
      .max(80, "Use no máximo 80 caracteres no nome da refeição."),
    dish: z
      .string()
      .trim()
      .min(1, "Informe o prato recomendado.")
      .max(500, "Use no máximo 500 caracteres no prato recomendado."),
    mealTime: hhmmSchema,
  })
  .strict();

export const dietDayInputSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    meals: z.array(dietMealInputSchema).max(24, "Um dia pode ter no máximo 24 refeições."),
  })
  .strict();

export const dietPlanInputSchema = z
  .object({
    waterRemindersEnabled: z.boolean(),
    waterStartTime: hhmmSchema,
    waterEndTime: hhmmSchema,
    waterIntervalMinutes: z
      .number()
      .int()
      .min(30, "O intervalo de água deve ser de pelo menos 30 minutos.")
      .max(360, "O intervalo de água deve ser de no máximo 360 minutos."),
    mealRemindersEnabled: z.boolean(),
    days: z.array(dietDayInputSchema).max(7, "Um plano pode ter no máximo sete dias."),
  })
  .strict()
  .superRefine((plan, context) => {
    if (plan.waterStartTime >= plan.waterEndTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "O início dos lembretes de água deve ser anterior ao fim.",
        path: ["waterEndTime"],
      });
    }

    const seenDays = new Set<number>();
    const seenMealIds = new Set<string>();

    plan.days.forEach((day, dayIndex) => {
      if (seenDays.has(day.dayOfWeek)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "O mesmo dia da semana não pode aparecer mais de uma vez.",
          path: ["days", dayIndex, "dayOfWeek"],
        });
      }
      seenDays.add(day.dayOfWeek);

      day.meals.forEach((meal, mealIndex) => {
        if (meal.id === undefined) return;

        const mealId = meal.id.toLowerCase();
        if (seenMealIds.has(mealId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "O mesmo ID de refeição não pode aparecer mais de uma vez.",
            path: ["days", dayIndex, "meals", mealIndex, "id"],
          });
        }
        seenMealIds.add(mealId);
      });
    });
  });

export type DietMealInput = z.input<typeof dietMealInputSchema>;
export type DietDayInput = z.input<typeof dietDayInputSchema>;
export type DietPlanInput = z.input<typeof dietPlanInputSchema>;

export type DietMeal = {
  id: string;
  name: string;
  dish: string;
  mealTime: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type DietDay = {
  id: string;
  dayOfWeek: number;
  meals: DietMeal[];
  createdAt: string;
  updatedAt: string;
};

export type DietPlan = {
  id: string;
  userId: string;
  waterRemindersEnabled: boolean;
  waterStartTime: string;
  waterEndTime: string;
  waterIntervalMinutes: number;
  mealRemindersEnabled: boolean;
  days: DietDay[];
  createdAt: string;
  updatedAt: string;
};

export const DIET_PLAN_DEFAULTS = {
  waterRemindersEnabled: false,
  waterStartTime: "08:00",
  waterEndTime: "22:00",
  waterIntervalMinutes: 120,
  mealRemindersEnabled: true,
} as const;

export const DEFAULT_DIET_PLAN_INPUT: DietPlanInput = {
  ...DIET_PLAN_DEFAULTS,
  days: [],
};

const databaseTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
  .transform((time) => time.slice(0, 5));

const timestampSchema = z.string().datetime({ offset: true });

const dietMealRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    dish: z.string(),
    meal_time: databaseTimeSchema,
    position: z.number().int().min(0).max(99),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict();

const dietDayRowSchema = z
  .object({
    id: z.string().uuid(),
    day_of_week: z.number().int().min(0).max(6),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    diet_meals: z.array(dietMealRowSchema),
  })
  .strict();

const dietPlanRowSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    water_reminders_enabled: z.boolean(),
    water_start_time: databaseTimeSchema,
    water_end_time: databaseTimeSchema,
    water_interval_minutes: z.number().int().min(30).max(360),
    meal_reminders_enabled: z.boolean(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    diet_days: z.array(dietDayRowSchema),
  })
  .strict();

const dietPlanColumns =
  "id, user_id, water_reminders_enabled, water_start_time, water_end_time, water_interval_minutes, meal_reminders_enabled, created_at, updated_at, diet_days(id, day_of_week, created_at, updated_at, diet_meals(id, name, dish, meal_time, position, created_at, updated_at))" as const;

function mapDietPlan(input: unknown): DietPlan {
  const plan = dietPlanRowSchema.parse(input);

  return {
    id: plan.id,
    userId: plan.user_id,
    waterRemindersEnabled: plan.water_reminders_enabled,
    waterStartTime: plan.water_start_time,
    waterEndTime: plan.water_end_time,
    waterIntervalMinutes: plan.water_interval_minutes,
    mealRemindersEnabled: plan.meal_reminders_enabled,
    days: plan.diet_days
      .map((day) => ({
        id: day.id,
        dayOfWeek: day.day_of_week,
        createdAt: day.created_at,
        updatedAt: day.updated_at,
        meals: day.diet_meals
          .map((meal) => ({
            id: meal.id,
            name: meal.name,
            dish: meal.dish,
            mealTime: meal.meal_time,
            position: meal.position,
            createdAt: meal.created_at,
            updatedAt: meal.updated_at,
          }))
          .sort(
            (left, right) =>
              left.mealTime.localeCompare(right.mealTime) ||
              left.position - right.position ||
              left.id.localeCompare(right.id),
          ),
      }))
      .sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.id.localeCompare(right.id)),
    createdAt: plan.created_at,
    updatedAt: plan.updated_at,
  };
}

async function readDietPlan(column: "id" | "user_id", value: string): Promise<DietPlan | null> {
  const { data, error } = await supabase
    .from("diet_plans")
    .select(dietPlanColumns)
    .eq(column, value)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapDietPlan(data) : null;
}

export async function getDietPlan(userId: string): Promise<DietPlan | null> {
  const parsedUserId = z.string().uuid().parse(userId);
  return readDietPlan("user_id", parsedUserId);
}

function toDaysJson(days: DietDayInput[]): Json {
  return days.map((day) => ({
    day_of_week: day.dayOfWeek,
    meals: day.meals.map((meal) => ({
      id: meal.id ?? null,
      name: meal.name,
      dish: meal.dish,
      meal_time: meal.mealTime,
    })),
  }));
}

export async function saveDietPlan(
  input: DietPlanInput,
  expectedUpdatedAt: string | null,
): Promise<DietPlan> {
  const plan = dietPlanInputSchema.parse(input);
  const expectedTimestamp = z
    .string()
    .datetime({ offset: true, message: "Informe um timestamp de atualização válido." })
    .nullable()
    .parse(expectedUpdatedAt);
  const { data: planId, error } = await supabase.rpc("save_diet_plan", {
    p_water_reminders_enabled: plan.waterRemindersEnabled,
    p_water_start_time: plan.waterStartTime,
    p_water_end_time: plan.waterEndTime,
    p_water_interval_minutes: plan.waterIntervalMinutes,
    p_meal_reminders_enabled: plan.mealRemindersEnabled,
    p_days: toDaysJson(plan.days),
    p_expected_updated_at: expectedTimestamp,
  });

  if (error) throw new Error(error.message);
  if (!planId) throw new Error("O Supabase não retornou o plano de dieta salvo.");

  const savedPlan = await readDietPlan("id", planId);
  if (!savedPlan) throw new Error("O plano de dieta salvo não foi encontrado.");
  return savedPlan;
}
