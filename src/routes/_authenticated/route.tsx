import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { NotificationCoordinator } from "@/components/NotificationCoordinator";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  // getSession lê a sessão salva localmente (sem ida à rede como getUser), então trocar de tela
  // não espera o servidor; o acesso aos dados continua protegido pelo RLS do Supabase.
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (error || !user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();

  return (
    <>
      <NotificationCoordinator userId={user.id} />
      <Outlet />
    </>
  );
}
