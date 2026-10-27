import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { getDietNotificationAction, reconcileDietNotifications } from "@/lib/diet-notifications";
import { getTaskNotificationAction, reconcileTaskNotifications } from "@/lib/task-notifications";

export function NotificationCoordinator({ userId }: { userId: string }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    async function reconcile() {
      await Promise.allSettled([
        reconcileTaskNotifications(userId),
        reconcileDietNotifications(userId),
      ]);
    }

    void reconcile();
    void Promise.all([
      App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void reconcile();
      }),
      LocalNotifications.addListener("localNotificationActionPerformed", ({ notification }) => {
        const dietAction = getDietNotificationAction(notification.extra);
        if (dietAction?.userId === userId) {
          void navigate({ to: "/dieta" });
          return;
        }

        const action = getTaskNotificationAction(notification.extra);
        if (action?.userId !== userId) return;
        void navigate({ to: "/tarefas" });
      }),
    ]).then((listenerHandles) => {
      if (disposed) {
        for (const handle of listenerHandles) void handle.remove();
        return;
      }
      handles.push(...listenerHandles);
    });

    return () => {
      disposed = true;
      for (const handle of handles) void handle.remove();
    };
  }, [navigate, userId]);

  return null;
}
