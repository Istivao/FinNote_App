import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "web",
    isNativePlatform: () => false,
  },
}));

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {},
}));

vi.mock("@/lib/tasks", () => ({
  listOpenTasks: vi.fn(),
}));

import { taskNotificationTimes } from "@/lib/task-notifications";
import type { Task, TaskPriority } from "@/lib/tasks";

function at(day: number, hour: number, minute = 0) {
  return new Date(2026, 8, day, hour, minute);
}

function task(priority: TaskPriority, dueAt: Date, createdAt: Date): Task {
  return {
    id: "task-id",
    title: "Tarefa",
    description: "Descricao",
    priority,
    dueAt: dueAt.toISOString(),
    completedAt: null,
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
  };
}

function summarize(times: ReturnType<typeof taskNotificationTimes>) {
  return times.map(({ kind, at: date }) => [
    kind,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ]);
}

describe("taskNotificationTimes", () => {
  it.each([
    ["urgent", [5, 6, 7, 8]],
    ["normal", [5, 7]],
    ["low", [5, 8]],
  ] as const)("uses the %s reminder cadence", (priority, reminderDays) => {
    const times = taskNotificationTimes(task(priority, at(8, 15), at(5, 8)), at(5, 8));

    expect(summarize(times)).toEqual([
      ...reminderDays.map((day) => ["reminder", day, 9, 0]),
      ["due", 8, 15, 0],
    ]);
  });

  it.each([
    ["urgent", [6, 7, 8, 9]],
    ["normal", [7, 9]],
    ["low", [8]],
  ] as const)("starts the %s cadence after a creation time later than 9am", (priority, days) => {
    const times = taskNotificationTimes(task(priority, at(9, 15), at(5, 10)), at(5, 10));

    expect(summarize(times)).toEqual([
      ...days.map((day) => ["reminder", day, 9, 0]),
      ["due", 9, 15, 0],
    ]);
  });

  it("does not recreate reminders whose time has already passed", () => {
    const times = taskNotificationTimes(task("urgent", at(7, 15), at(1, 8)), at(5, 12));

    expect(summarize(times)).toEqual([
      ["reminder", 6, 9, 0],
      ["reminder", 7, 9, 0],
      ["due", 7, 15, 0],
    ]);
  });

  it("keeps the exact deadline alert when no 9am reminder fits", () => {
    const times = taskNotificationTimes(task("low", at(5, 10), at(5, 9, 30)), at(5, 9, 30));

    expect(summarize(times)).toEqual([["due", 5, 10, 0]]);
  });

  it("returns no alerts after the deadline", () => {
    expect(taskNotificationTimes(task("urgent", at(4, 15), at(1, 8)), at(5, 8))).toEqual([]);
  });
});
