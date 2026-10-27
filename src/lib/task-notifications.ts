import { Capacitor, type PermissionState } from "@capacitor/core";
import {
  LocalNotifications,
  type LocalNotificationSchema,
  type PendingLocalNotificationSchema,
} from "@capacitor/local-notifications";

import { listOpenTasks, type Task, type TaskPriority } from "@/lib/tasks";

const TASK_NOTIFICATION_SOURCE = "finnote-task";
const TASK_NOTIFICATION_GROUP = "finnote-tasks";
const URGENT_CHANNEL_ID = "finnote-tasks-urgent";
const STANDARD_CHANNEL_ID = "finnote-tasks-standard";
const MAX_PENDING_NOTIFICATIONS = 400;

let notificationOperation = Promise.resolve();

type TaskNotificationKind = "reminder" | "due";

type TaskNotificationExtra = {
  source: typeof TASK_NOTIFICATION_SOURCE;
  userId: string;
  taskId: string;
  kind: TaskNotificationKind;
};

export type TaskNotificationPermissionStatus = {
  supported: boolean;
  display: PermissionState;
  exact: PermissionState;
};

export type TaskNotificationTime = {
  at: Date;
  kind: TaskNotificationKind;
};

function reminderInterval(priority: TaskPriority) {
  if (priority === "urgent") return 1;
  if (priority === "normal") return 2;
  return 3;
}

function isValidDate(date: Date) {
  return Number.isFinite(date.getTime());
}

export function taskNotificationTimes(task: Task, now = new Date()): TaskNotificationTime[] {
  if (task.completedAt) return [];

  const dueAt = new Date(task.dueAt);
  if (!isValidDate(dueAt) || dueAt <= now) return [];

  const createdAt = new Date(task.createdAt);
  const anchor = isValidDate(createdAt) ? createdAt : now;
  const intervalDays = reminderInterval(task.priority);
  const reminder = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 9, 0, 0, 0);

  if (reminder <= anchor) reminder.setDate(reminder.getDate() + intervalDays);
  while (reminder <= now) reminder.setDate(reminder.getDate() + intervalDays);

  const times: TaskNotificationTime[] = [];
  while (reminder < dueAt && times.length < MAX_PENDING_NOTIFICATIONS) {
    times.push({ at: new Date(reminder), kind: "reminder" });
    reminder.setDate(reminder.getDate() + intervalDays);
  }

  times.push({ at: dueAt, kind: "due" });
  return times;
}

function isTaskNotificationExtra(value: unknown): value is TaskNotificationExtra {
  if (!value || typeof value !== "object") return false;
  const extra = value as Partial<TaskNotificationExtra>;
  return (
    extra.source === TASK_NOTIFICATION_SOURCE &&
    typeof extra.userId === "string" &&
    typeof extra.taskId === "string" &&
    (extra.kind === "reminder" || extra.kind === "due")
  );
}

function pendingExtra(notification: PendingLocalNotificationSchema) {
  return isTaskNotificationExtra(notification.extra) ? notification.extra : null;
}

function notificationId(key: string, usedIds: Set<number>) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  let id = 1_000_000_000 + ((hash >>> 0) % 1_000_000_000);
  while (usedIds.has(id)) {
    id += 1;
    if (id >= 2_000_000_000) id = 1_000_000_000;
  }
  usedIds.add(id);
  return id;
}

function dueLabel(dueAt: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dueAt);
}

function isNative() {
  return Capacitor.isNativePlatform();
}

async function exactAlarmPermission(): Promise<PermissionState> {
  if (Capacitor.getPlatform() !== "android") return "granted";
  try {
    const permission = await LocalNotifications.checkExactNotificationSetting();
    return permission.exact_alarm;
  } catch {
    return "denied";
  }
}

export async function getTaskNotificationPermissionStatus(): Promise<TaskNotificationPermissionStatus> {
  if (!isNative()) return { supported: false, display: "denied", exact: "denied" };

  const permission = await LocalNotifications.checkPermissions();
  return {
    supported: true,
    display: permission.display,
    exact: await exactAlarmPermission(),
  };
}

export async function requestTaskNotificationPermissions(): Promise<TaskNotificationPermissionStatus> {
  if (!isNative()) return { supported: false, display: "denied", exact: "denied" };

  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") {
    permission = await LocalNotifications.requestPermissions();
  }

  let exact = await exactAlarmPermission();
  if (
    permission.display === "granted" &&
    Capacitor.getPlatform() === "android" &&
    exact !== "granted"
  ) {
    const result = await LocalNotifications.changeExactNotificationSetting();
    exact = result.exact_alarm;
  }

  return { supported: true, display: permission.display, exact };
}

async function ensureChannels() {
  if (Capacitor.getPlatform() !== "android") return;

  await Promise.allSettled([
    LocalNotifications.createChannel({
      id: URGENT_CHANNEL_ID,
      name: "Tarefas urgentes",
      description: "Avisos de tarefas marcadas como urgentes.",
      importance: 4,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: "#F5A847",
    }),
    LocalNotifications.createChannel({
      id: STANDARD_CHANNEL_ID,
      name: "Tarefas",
      description: "Avisos de tarefas normais e de baixa prioridade.",
      importance: 3,
      visibility: 1,
      vibration: true,
    }),
  ]);
}

async function pendingTaskNotifications(userId: string, taskId?: string) {
  const pending = await LocalNotifications.getPending();
  return pending.notifications.filter((notification) => {
    const extra = pendingExtra(notification);
    return extra?.userId === userId && (!taskId || extra.taskId === taskId);
  });
}

async function deliveredTaskNotifications(userId: string, taskId?: string) {
  const delivered = await LocalNotifications.getAll({ state: "TRIGGERED" });
  return delivered.notifications.filter((notification) => {
    const extra = isTaskNotificationExtra(notification.extra) ? notification.extra : null;
    return extra?.userId === userId && (!taskId || extra.taskId === taskId);
  });
}

function runNotificationOperation<T>(operation: () => Promise<T>) {
  const result = notificationOperation.then(operation, operation);
  notificationOperation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function cancelTaskNotificationsNow(userId: string, taskId?: string) {
  if (!isNative()) return;

  const [pending, delivered] = await Promise.all([
    pendingTaskNotifications(userId, taskId),
    deliveredTaskNotifications(userId, taskId),
  ]);

  if (pending.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.map(({ id }) => ({ id })) });
  }
  if (delivered.length > 0) {
    await LocalNotifications.removeDeliveredNotificationsById({
      ids: delivered.map(({ id }) => id),
    });
  }
}

export function cancelTaskNotifications(userId: string, taskId?: string) {
  return runNotificationOperation(() => cancelTaskNotificationsNow(userId, taskId));
}

function buildNotifications(userId: string, tasks: Task[], exact: boolean) {
  const now = new Date();
  const candidates = tasks.flatMap((task) =>
    taskNotificationTimes(task, now).map((time) => ({ task, ...time })),
  );
  const dueNotifications = candidates
    .filter((candidate) => candidate.kind === "due")
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_PENDING_NOTIFICATIONS);
  const remainingSlots = MAX_PENDING_NOTIFICATIONS - dueNotifications.length;
  const reminders = candidates
    .filter((candidate) => candidate.kind === "reminder")
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, remainingSlots);
  const selected = [...dueNotifications, ...reminders].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  );
  const usedIds = new Set<number>();

  return selected.map<LocalNotificationSchema>(({ task, at, kind }) => {
    const extra: TaskNotificationExtra = {
      source: TASK_NOTIFICATION_SOURCE,
      userId,
      taskId: task.id,
      kind,
    };
    const isDue = kind === "due";

    return {
      id: notificationId(`${userId}:${task.id}:${kind}:${at.toISOString()}`, usedIds),
      title: isDue ? "Prazo da tarefa" : "Lembrete de tarefa",
      body: isDue ? task.title : `${task.title} · vence em ${dueLabel(new Date(task.dueAt))}`,
      largeBody: task.description,
      schedule: { at, allowWhileIdle: true },
      channelId: task.priority === "urgent" ? URGENT_CHANNEL_ID : STANDARD_CHANNEL_ID,
      group: TASK_NOTIFICATION_GROUP,
      autoCancel: true,
      foreground: true,
      isExactNotification: exact,
      isExactMandatory: false,
      extra,
    };
  });
}

async function reconcileTaskNotificationsNow(userId: string, tasks?: Task[]) {
  if (!isNative()) return 0;

  const currentTasks = tasks ?? (await listOpenTasks());
  const existing = await pendingTaskNotifications(userId);
  if (existing.length > 0) {
    await LocalNotifications.cancel({ notifications: existing.map(({ id }) => ({ id })) });
  }

  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") return 0;

  await ensureChannels();
  const exact = (await exactAlarmPermission()) === "granted";
  const notifications = buildNotifications(userId, currentTasks, exact);

  for (let index = 0; index < notifications.length; index += 50) {
    await LocalNotifications.schedule({ notifications: notifications.slice(index, index + 50) });
  }

  return notifications.length;
}

export function reconcileTaskNotifications(userId: string, tasks?: Task[]) {
  return runNotificationOperation(() => reconcileTaskNotificationsNow(userId, tasks));
}

export function getTaskNotificationAction(value: unknown) {
  return isTaskNotificationExtra(value) ? value : null;
}
