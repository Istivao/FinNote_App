import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  platform: "web",
  native: false,
  pluginAvailable: false,
}));

const localNotifications = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  createChannel: vi.fn(),
  getPending: vi.fn(),
  getAll: vi.fn(),
  cancel: vi.fn(),
  removeDeliveredNotificationsById: vi.fn(),
  schedule: vi.fn(),
}));

const diet = vi.hoisted(() => ({
  getDietPlan: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => runtime.platform,
    isNativePlatform: () => runtime.native,
    isPluginAvailable: () => runtime.pluginAvailable,
  },
}));

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: localNotifications,
}));

vi.mock("./diet", () => diet);

import {
  buildDietNotificationPlan,
  cancelDietNotifications,
  dietWaterReminderSlots,
  getDietNotificationPermissionStatus,
  listDietNotifications,
  reconcileDietNotifications,
  requestDietNotificationPermissions,
  type DietNotificationPlan,
} from "./diet-notifications";

function dietPlan(overrides: Partial<DietNotificationPlan> = {}): DietNotificationPlan {
  return {
    waterRemindersEnabled: true,
    waterStartTime: "08:00",
    waterEndTime: "12:00",
    waterIntervalMinutes: 120,
    mealRemindersEnabled: true,
    days: [],
    ...overrides,
  };
}

beforeEach(() => {
  runtime.platform = "web";
  runtime.native = false;
  runtime.pluginAvailable = false;
  vi.clearAllMocks();
});

describe("dietWaterReminderSlots", () => {
  it("creates every HH:mm slot inside an inclusive window", () => {
    expect(dietWaterReminderSlots("08:00", "12:00", 120)).toEqual(["08:00", "10:00", "12:00"]);
  });

  it("does not pass the end of the window when the interval does not land on it", () => {
    expect(dietWaterReminderSlots("08:15", "10:00", 60)).toEqual(["08:15", "09:15"]);
  });

  it("accepts the inclusive boundary as a single slot", () => {
    expect(dietWaterReminderSlots("09:30", "09:30", 60)).toEqual(["09:30"]);
  });
});

describe("buildDietNotificationPlan", () => {
  it("uses daily on schedules without a weekday for all water slots", () => {
    const notifications = buildDietNotificationPlan(
      "user-1",
      dietPlan({ mealRemindersEnabled: false }),
    );

    expect(notifications).toHaveLength(3);
    expect(
      notifications.map((notification) => ({
        channelId: notification.channelId,
        on: notification.schedule?.on,
        allowWhileIdle: notification.schedule?.allowWhileIdle,
        isExactNotification: notification.isExactNotification,
        extra: notification.extra,
      })),
    ).toEqual([
      {
        channelId: "finnote-water-v1",
        on: { hour: 8, minute: 0 },
        allowWhileIdle: false,
        isExactNotification: false,
        extra: {
          source: "finnote-diet",
          version: 1,
          userId: "user-1",
          route: "/dieta",
          kind: "water",
          slot: "08:00",
        },
      },
      {
        channelId: "finnote-water-v1",
        on: { hour: 10, minute: 0 },
        allowWhileIdle: false,
        isExactNotification: false,
        extra: {
          source: "finnote-diet",
          version: 1,
          userId: "user-1",
          route: "/dieta",
          kind: "water",
          slot: "10:00",
        },
      },
      {
        channelId: "finnote-water-v1",
        on: { hour: 12, minute: 0 },
        allowWhileIdle: false,
        isExactNotification: false,
        extra: {
          source: "finnote-diet",
          version: 1,
          userId: "user-1",
          route: "/dieta",
          kind: "water",
          slot: "12:00",
        },
      },
    ]);
  });

  it("maps Sunday and Monday to Capacitor weekdays 1 and 2", () => {
    const notifications = buildDietNotificationPlan(
      "user-1",
      dietPlan({
        waterRemindersEnabled: false,
        days: [
          {
            dayOfWeek: 0,
            meals: [
              {
                id: "sunday-meal",
                name: "Café da manhã",
                dish: "Frutas",
                mealTime: "08:30",
              },
            ],
          },
          {
            dayOfWeek: 1,
            meals: [
              {
                id: "monday-meal",
                name: "Almoço",
                dish: "Arroz e feijão",
                mealTime: "12:15",
              },
            ],
          },
        ],
      }),
    );

    const weekdayByMeal = Object.fromEntries(
      notifications.map((notification) => [
        notification.extra.kind === "meal" ? notification.extra.mealId : "",
        notification.schedule?.on?.weekday,
      ]),
    );
    expect(weekdayByMeal).toEqual({ "monday-meal": 2, "sunday-meal": 1 });
    expect(notifications.every(({ channelId }) => channelId === "finnote-meals-v1")).toBe(true);
  });

  it("does not create notifications for disabled reminders", () => {
    expect(
      buildDietNotificationPlan(
        "user-1",
        dietPlan({ waterRemindersEnabled: false, mealRemindersEnabled: false }),
      ),
    ).toEqual([]);
  });

  it("creates deterministic, unique IDs only in the diet range", () => {
    const plan = dietPlan({
      waterRemindersEnabled: false,
      days: [
        {
          dayOfWeek: 0,
          meals: [
            // These distinct keys share an FNV bucket in the diet ID range.
            { id: "meal-4043", name: "Café", dish: "Frutas", mealTime: "12:00" },
            { id: "meal-19047", name: "Almoço", dish: "Salada", mealTime: "12:00" },
          ],
        },
      ],
    });

    const firstIds = buildDietNotificationPlan("user-1", plan).map(({ id }) => id);
    const secondIds = buildDietNotificationPlan("user-1", plan).map(({ id }) => id);

    expect(secondIds).toEqual(firstIds);
    expect(new Set(firstIds).size).toBe(firstIds.length);
    expect(firstIds.every((id) => id >= 2_000_000_000 && id <= 2_147_000_000)).toBe(true);
    expect(firstIds[1]).toBe((firstIds[0] ?? 0) + 1);
  });
});

describe("notification permission", () => {
  it("reports web as unsupported without touching the plugin", async () => {
    await expect(getDietNotificationPermissionStatus()).resolves.toEqual({
      supported: false,
      display: "denied",
    });
    await expect(requestDietNotificationPermissions()).resolves.toEqual({
      supported: false,
      display: "denied",
    });
    expect(localNotifications.checkPermissions).not.toHaveBeenCalled();
    expect(localNotifications.requestPermissions).not.toHaveBeenCalled();
  });

  it("requests only display permission when the Android plugin is available", async () => {
    runtime.platform = "android";
    runtime.native = true;
    runtime.pluginAvailable = true;
    localNotifications.checkPermissions.mockResolvedValue({ display: "prompt" });
    localNotifications.requestPermissions.mockResolvedValue({ display: "granted" });

    await expect(requestDietNotificationPermissions()).resolves.toEqual({
      supported: true,
      display: "granted",
    });
    expect(localNotifications.checkPermissions).toHaveBeenCalledOnce();
    expect(localNotifications.requestPermissions).toHaveBeenCalledOnce();
  });

  it("reports unsupported when Android does not expose the plugin", async () => {
    runtime.platform = "android";
    runtime.native = true;

    await expect(getDietNotificationPermissionStatus()).resolves.toEqual({
      supported: false,
      display: "denied",
    });
    expect(localNotifications.checkPermissions).not.toHaveBeenCalled();
  });
});

describe("diet notification reconciliation", () => {
  beforeEach(() => {
    runtime.platform = "android";
    runtime.native = true;
    runtime.pluginAvailable = true;
  });

  it("lists and cancels only diet notifications for the requested user", async () => {
    const firstUserExtra = {
      source: "finnote-diet",
      version: 1,
      userId: "user-1",
      route: "/dieta",
      kind: "water",
      slot: "08:00",
    };
    const secondUserExtra = { ...firstUserExtra, userId: "user-2" };
    localNotifications.getPending.mockResolvedValue({
      notifications: [
        { id: 1, title: "Água", body: "Água", extra: firstUserExtra },
        { id: 2, title: "Água", body: "Água", extra: secondUserExtra },
        { id: 3, title: "Tarefa", body: "Tarefa", extra: { source: "finnote-task" } },
      ],
    });
    localNotifications.getAll.mockResolvedValue({
      notifications: [
        { id: 4, title: "Água", body: "Água", extra: firstUserExtra },
        { id: 5, title: "Água", body: "Água", extra: secondUserExtra },
      ],
    });

    await expect(listDietNotifications("user-1")).resolves.toEqual({
      pending: [{ id: 1, title: "Água", body: "Água", extra: firstUserExtra }],
      delivered: [{ id: 4, title: "Água", body: "Água", extra: firstUserExtra }],
    });
    await cancelDietNotifications("user-1");

    expect(localNotifications.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }] });
    expect(localNotifications.removeDeliveredNotificationsById).toHaveBeenCalledWith({ ids: [4] });
  });

  it("loads the saved plan and schedules it in batches", async () => {
    const days = Array.from({ length: 3 }, (_, dayOfWeek) => ({
      dayOfWeek,
      meals: Array.from({ length: 17 }, (_, mealIndex) => ({
        id: `meal-${dayOfWeek}-${mealIndex}`,
        name: "Refeição",
        dish: "Prato recomendado",
        mealTime: `${String(6 + mealIndex).padStart(2, "0")}:00`,
      })),
    }));
    diet.getDietPlan.mockResolvedValue(
      dietPlan({ waterRemindersEnabled: false, mealRemindersEnabled: true, days }),
    );
    localNotifications.getPending.mockResolvedValue({ notifications: [] });
    localNotifications.getAll.mockResolvedValue({ notifications: [] });
    localNotifications.checkPermissions.mockResolvedValue({ display: "granted" });
    localNotifications.createChannel.mockResolvedValue(undefined);
    localNotifications.schedule.mockResolvedValue({ notifications: [] });

    await expect(reconcileDietNotifications("user-1")).resolves.toBe(51);

    expect(diet.getDietPlan).toHaveBeenCalledWith("user-1");
    expect(
      localNotifications.createChannel.mock.calls.map(([channel]) => channel.id).sort(),
    ).toEqual(["finnote-meals-v1", "finnote-water-v1"]);
    expect(localNotifications.schedule).toHaveBeenCalledTimes(2);
    expect(
      localNotifications.schedule.mock.calls.map(([{ notifications }]) => notifications.length),
    ).toEqual([50, 1]);
  });
});
