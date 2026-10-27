import { Capacitor, type PermissionState } from "@capacitor/core";
import {
  LocalNotifications,
  type LocalNotificationSchema,
  type PendingLocalNotificationSchema,
  type Weekday,
} from "@capacitor/local-notifications";

import { getDietPlan } from "./diet";

const DIET_NOTIFICATION_SOURCE = "finnote-diet";
const DIET_NOTIFICATION_VERSION = 1;
const DIET_NOTIFICATION_ROUTE = "/dieta";
const WATER_CHANNEL_ID = "finnote-water-v1";
const MEALS_CHANNEL_ID = "finnote-meals-v1";
const DIET_NOTIFICATION_GROUP = "finnote-diet";
const MIN_NOTIFICATION_ID = 2_000_000_000;
const MAX_NOTIFICATION_ID = 2_147_000_000;
const NOTIFICATION_ID_RANGE = MAX_NOTIFICATION_ID - MIN_NOTIFICATION_ID + 1;
const NOTIFICATION_BATCH_SIZE = 50;

let notificationOperation = Promise.resolve();

export type DietNotificationPermissionStatus = {
  supported: boolean;
  display: PermissionState;
};

export type DietNotificationMeal = {
  id: string;
  name: string;
  dish: string;
  mealTime: string;
};

export type DietNotificationDay = {
  dayOfWeek: number;
  meals: DietNotificationMeal[];
};

export type DietNotificationPlan = {
  waterRemindersEnabled: boolean;
  waterStartTime: string;
  waterEndTime: string;
  waterIntervalMinutes: number;
  mealRemindersEnabled: boolean;
  days: DietNotificationDay[];
};

type DietNotificationExtraBase = {
  source: typeof DIET_NOTIFICATION_SOURCE;
  version: typeof DIET_NOTIFICATION_VERSION;
  userId: string;
  route: typeof DIET_NOTIFICATION_ROUTE;
};

export type DietWaterNotificationExtra = DietNotificationExtraBase & {
  kind: "water";
  slot: string;
};

export type DietMealNotificationExtra = DietNotificationExtraBase & {
  kind: "meal";
  mealId: string;
};

export type DietNotificationExtra = DietWaterNotificationExtra | DietMealNotificationExtra;

export type DietLocalNotification = Omit<LocalNotificationSchema, "extra"> & {
  extra: DietNotificationExtra;
};

export type DietNotifications = {
  pending: PendingLocalNotificationSchema[];
  delivered: LocalNotificationSchema[];
};

type NotificationCandidate = {
  key: string;
  notification: Omit<DietLocalNotification, "id">;
};

function parseTime(value: string) {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  return { hour, minute, totalMinutes: hour * 60 + minute };
}

function formatTime(totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function dietWaterReminderSlots(
  startTime: string,
  endTime: string,
  intervalMinutes: number,
) {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  if (
    !start ||
    !end ||
    !Number.isInteger(intervalMinutes) ||
    intervalMinutes <= 0 ||
    start.totalMinutes > end.totalMinutes
  ) {
    return [];
  }

  const slots: string[] = [];
  for (
    let totalMinutes = start.totalMinutes;
    totalMinutes <= end.totalMinutes;
    totalMinutes += intervalMinutes
  ) {
    slots.push(formatTime(totalMinutes));
  }
  return slots;
}

function hashNotificationKey(key: string) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function notificationId(key: string, usedIds: Set<number>) {
  let id = MIN_NOTIFICATION_ID + (hashNotificationKey(key) % NOTIFICATION_ID_RANGE);
  const firstId = id;

  while (usedIds.has(id)) {
    id = id === MAX_NOTIFICATION_ID ? MIN_NOTIFICATION_ID : id + 1;
    if (id === firstId) throw new Error("Não há IDs disponíveis para notificações de dieta.");
  }

  usedIds.add(id);
  return id;
}

function commonExtra(userId: string): DietNotificationExtraBase {
  return {
    source: DIET_NOTIFICATION_SOURCE,
    version: DIET_NOTIFICATION_VERSION,
    userId,
    route: DIET_NOTIFICATION_ROUTE,
  };
}

export function buildDietNotificationPlan(
  userId: string,
  plan: DietNotificationPlan | null | undefined,
): DietLocalNotification[] {
  if (!userId || !plan) return [];

  const candidates: NotificationCandidate[] = [];

  if (plan.waterRemindersEnabled) {
    for (const slot of dietWaterReminderSlots(
      plan.waterStartTime,
      plan.waterEndTime,
      plan.waterIntervalMinutes,
    )) {
      const time = parseTime(slot);
      if (!time) continue;

      const extra: DietWaterNotificationExtra = {
        ...commonExtra(userId),
        kind: "water",
        slot,
      };
      candidates.push({
        key: `${userId}:water:${slot}`,
        notification: {
          title: "Hora de beber água",
          body: "Faça uma pausa e mantenha sua hidratação em dia.",
          schedule: {
            on: { hour: time.hour, minute: time.minute },
            allowWhileIdle: false,
          },
          channelId: WATER_CHANNEL_ID,
          group: DIET_NOTIFICATION_GROUP,
          autoCancel: true,
          foreground: true,
          isExactNotification: false,
          extra,
        },
      });
    }
  }

  if (plan.mealRemindersEnabled) {
    for (const day of plan.days) {
      if (!Number.isInteger(day.dayOfWeek) || day.dayOfWeek < 0 || day.dayOfWeek > 6) continue;

      for (const meal of day.meals) {
        const time = parseTime(meal.mealTime);
        if (!meal.id || !time) continue;

        const extra: DietMealNotificationExtra = {
          ...commonExtra(userId),
          kind: "meal",
          mealId: meal.id,
        };
        candidates.push({
          key: `${userId}:meal:${meal.id}:${day.dayOfWeek}:${formatTime(time.totalMinutes)}`,
          notification: {
            title: "Hora da refeição",
            body: `${meal.name}: ${meal.dish}`,
            largeBody: meal.dish,
            schedule: {
              on: {
                weekday: (day.dayOfWeek + 1) as Weekday,
                hour: time.hour,
                minute: time.minute,
              },
              allowWhileIdle: false,
            },
            channelId: MEALS_CHANNEL_ID,
            group: DIET_NOTIFICATION_GROUP,
            autoCancel: true,
            foreground: true,
            isExactNotification: false,
            extra,
          },
        });
      }
    }
  }

  const usedIds = new Set<number>();
  return candidates
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
    .map(({ key, notification }) => ({
      ...notification,
      id: notificationId(key, usedIds),
    }));
}

export function isDietNotificationExtra(value: unknown): value is DietNotificationExtra {
  if (!value || typeof value !== "object") return false;
  const extra = value as Record<string, unknown>;

  if (
    extra["source"] !== DIET_NOTIFICATION_SOURCE ||
    extra["version"] !== DIET_NOTIFICATION_VERSION ||
    typeof extra["userId"] !== "string" ||
    extra["route"] !== DIET_NOTIFICATION_ROUTE
  ) {
    return false;
  }

  if (extra["kind"] === "water") return typeof extra["slot"] === "string";
  if (extra["kind"] === "meal") return typeof extra["mealId"] === "string";
  return false;
}

export function getDietNotificationAction(value: unknown) {
  return isDietNotificationExtra(value) ? value : null;
}

export function isDietNotificationsSupported() {
  return (
    Capacitor.getPlatform() === "android" &&
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable("LocalNotifications")
  );
}

export async function getDietNotificationPermissionStatus(): Promise<DietNotificationPermissionStatus> {
  if (!isDietNotificationsSupported()) return { supported: false, display: "denied" };

  const permission = await LocalNotifications.checkPermissions();
  return { supported: true, display: permission.display };
}

export async function requestDietNotificationPermissions(): Promise<DietNotificationPermissionStatus> {
  if (!isDietNotificationsSupported()) return { supported: false, display: "denied" };

  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") {
    permission = await LocalNotifications.requestPermissions();
  }
  return { supported: true, display: permission.display };
}

async function ensureChannels() {
  await Promise.all([
    LocalNotifications.createChannel({
      id: WATER_CHANNEL_ID,
      name: "Lembretes de água",
      description: "Avisos recorrentes para beber água.",
      importance: 3,
      visibility: 1,
      vibration: true,
    }),
    LocalNotifications.createChannel({
      id: MEALS_CHANNEL_ID,
      name: "Lembretes de refeições",
      description: "Avisos recorrentes dos horários das refeições.",
      importance: 3,
      visibility: 1,
      vibration: true,
    }),
  ]);
}

function belongsToUser(notification: { extra?: unknown }, userId?: string) {
  const extra = getDietNotificationAction(notification.extra);
  return extra !== null && (userId === undefined || extra.userId === userId);
}

export async function listDietNotifications(userId?: string): Promise<DietNotifications> {
  if (!isDietNotificationsSupported()) return { pending: [], delivered: [] };

  const [pending, delivered] = await Promise.all([
    LocalNotifications.getPending(),
    LocalNotifications.getAll({ state: "TRIGGERED" }),
  ]);

  return {
    pending: pending.notifications.filter((notification) => belongsToUser(notification, userId)),
    delivered: delivered.notifications.filter((notification) =>
      belongsToUser(notification, userId),
    ),
  };
}

async function inBatches<T>(items: T[], operation: (batch: T[]) => Promise<unknown>) {
  for (let index = 0; index < items.length; index += NOTIFICATION_BATCH_SIZE) {
    await operation(items.slice(index, index + NOTIFICATION_BATCH_SIZE));
  }
}

async function cancelPending(notifications: Array<{ id: number }>) {
  await inBatches(notifications, (batch) =>
    LocalNotifications.cancel({ notifications: batch.map(({ id }) => ({ id })) }),
  );
}

function runNotificationOperation<T>(operation: () => Promise<T>) {
  const result = notificationOperation.then(operation, operation);
  notificationOperation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function cancelDietNotificationsNow(userId?: string) {
  const { pending, delivered } = await listDietNotifications(userId);
  await cancelPending(pending);
  await inBatches(delivered, (batch) =>
    LocalNotifications.removeDeliveredNotificationsById({ ids: batch.map(({ id }) => id) }),
  );
}

export function cancelDietNotifications(userId?: string) {
  return runNotificationOperation(() => cancelDietNotificationsNow(userId));
}

async function reconcileDietNotificationsNow(userId: string) {
  if (!isDietNotificationsSupported()) return 0;

  const plan = await getDietPlan(userId);
  const notifications = buildDietNotificationPlan(userId, plan);
  await cancelDietNotificationsNow(userId);

  if (notifications.length === 0) return 0;

  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") return 0;

  await ensureChannels();
  await inBatches(notifications, (batch) => LocalNotifications.schedule({ notifications: batch }));
  return notifications.length;
}

export function reconcileDietNotifications(userId: string) {
  return runNotificationOperation(() => reconcileDietNotificationsNow(userId));
}
