import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/treinos/$id")({
  component: () => <Outlet />,
});
