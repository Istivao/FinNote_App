import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: supabaseMocks,
}));

import {
  DEFAULT_DIET_PLAN_INPUT,
  dietPlanInputSchema,
  getDietPlan,
  saveDietPlan,
} from "@/lib/diet";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const PLAN_ID = "00000000-0000-4000-8000-000000000002";
const UPDATED_AT = "2026-09-12T12:00:00+00:00";

const planRow = {
  id: PLAN_ID,
  user_id: USER_ID,
  water_reminders_enabled: false,
  water_start_time: "08:00:00",
  water_end_time: "22:00:00",
  water_interval_minutes: 120,
  meal_reminders_enabled: true,
  created_at: "2026-09-12T10:00:00+00:00",
  updated_at: UPDATED_AT,
  diet_days: [
    {
      id: "00000000-0000-4000-8000-000000000012",
      day_of_week: 4,
      created_at: "2026-09-12T10:00:00+00:00",
      updated_at: UPDATED_AT,
      diet_meals: [],
    },
    {
      id: "00000000-0000-4000-8000-000000000011",
      day_of_week: 1,
      created_at: "2026-09-12T10:00:00+00:00",
      updated_at: UPDATED_AT,
      diet_meals: [
        {
          id: "00000000-0000-4000-8000-000000000022",
          name: "Almoço",
          dish: "Arroz e feijão",
          meal_time: "12:30:00",
          position: 0,
          created_at: "2026-09-12T10:00:00+00:00",
          updated_at: UPDATED_AT,
        },
        {
          id: "00000000-0000-4000-8000-000000000021",
          name: "Café da manhã",
          dish: "Frutas",
          meal_time: "08:15:00",
          position: 1,
          created_at: "2026-09-12T10:00:00+00:00",
          updated_at: UPDATED_AT,
        },
      ],
    },
  ],
};

function mockPlanRead(data: unknown, error: { message: string } | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  supabaseMocks.from.mockReturnValue({ select });
  return { select, eq, maybeSingle };
}

function meal(id?: string) {
  return {
    ...(id === undefined ? {} : { id }),
    name: "Almoço",
    dish: "Arroz, feijão e salada",
    mealTime: "12:30",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dietPlanInputSchema", () => {
  it("accepts the exported defaults", () => {
    expect(dietPlanInputSchema.parse(DEFAULT_DIET_PLAN_INPUT)).toEqual({
      waterRemindersEnabled: false,
      waterStartTime: "08:00",
      waterEndTime: "22:00",
      waterIntervalMinutes: 120,
      mealRemindersEnabled: true,
      days: [],
    });
  });

  it("rejects invalid limits, times and water windows", () => {
    expect(
      dietPlanInputSchema.safeParse({
        ...DEFAULT_DIET_PLAN_INPUT,
        waterStartTime: "8:00",
      }).success,
    ).toBe(false);
    expect(
      dietPlanInputSchema.safeParse({
        ...DEFAULT_DIET_PLAN_INPUT,
        waterStartTime: "22:00",
        waterEndTime: "08:00",
      }).success,
    ).toBe(false);
    expect(
      dietPlanInputSchema.safeParse({
        ...DEFAULT_DIET_PLAN_INPUT,
        waterIntervalMinutes: 29,
      }).success,
    ).toBe(false);
    expect(
      dietPlanInputSchema.safeParse({
        ...DEFAULT_DIET_PLAN_INPUT,
        days: [{ dayOfWeek: 0, meals: Array.from({ length: 25 }, () => meal()) }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate weekdays and meal IDs across the plan", () => {
    const mealId = "00000000-0000-4000-8000-000000000031";
    const result = dietPlanInputSchema.safeParse({
      ...DEFAULT_DIET_PLAN_INPUT,
      days: [
        { dayOfWeek: 2, meals: [meal(mealId)] },
        { dayOfWeek: 2, meals: [meal(mealId.toUpperCase())] },
      ],
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "days.1.dayOfWeek",
      "days.1.meals.0.id",
    ]);
  });
});

describe("getDietPlan", () => {
  it("maps nested rows, normalizes TIME values and orders days and meals", async () => {
    const query = mockPlanRead(planRow);

    const plan = await getDietPlan(USER_ID);

    expect(supabaseMocks.from).toHaveBeenCalledWith("diet_plans");
    expect(query.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(plan?.waterStartTime).toBe("08:00");
    expect(plan?.waterEndTime).toBe("22:00");
    expect(plan?.days.map((day) => day.dayOfWeek)).toEqual([1, 4]);
    expect(plan?.days[0]?.meals.map((item) => [item.position, item.mealTime])).toEqual([
      [1, "08:15"],
      [0, "12:30"],
    ]);
  });

  it("returns null when the user has no plan", async () => {
    mockPlanRead(null);

    await expect(getDietPlan(USER_ID)).resolves.toBeNull();
  });
});

describe("saveDietPlan", () => {
  it("calls the transactional RPC and reads the saved plan again", async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: PLAN_ID, error: null });
    const query = mockPlanRead(planRow);
    const input = {
      ...DEFAULT_DIET_PLAN_INPUT,
      days: [{ dayOfWeek: 1, meals: [meal()] }],
    };

    const savedPlan = await saveDietPlan(input, UPDATED_AT);

    expect(supabaseMocks.rpc).toHaveBeenCalledWith("save_diet_plan", {
      p_water_reminders_enabled: false,
      p_water_start_time: "08:00",
      p_water_end_time: "22:00",
      p_water_interval_minutes: 120,
      p_meal_reminders_enabled: true,
      p_days: [
        {
          day_of_week: 1,
          meals: [
            {
              id: null,
              name: "Almoço",
              dish: "Arroz, feijão e salada",
              meal_time: "12:30",
            },
          ],
        },
      ],
      p_expected_updated_at: UPDATED_AT,
    });
    expect(query.eq).toHaveBeenCalledWith("id", PLAN_ID);
    expect(savedPlan.id).toBe(PLAN_ID);
  });
});
