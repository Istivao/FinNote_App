import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  getHiddenHomeFeatures,
  HIDDEN_HOME_FEATURES_METADATA_KEY,
  HOME_FEATURES,
  type HomeFeatureId,
} from "@/lib/home-features";
import { cancelDietNotifications } from "@/lib/diet-notifications";
import { cancelTaskNotifications } from "@/lib/task-notifications";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil | FinNote" },
      {
        name: "description",
        content: "Gerencie sua conta FinNote e saia do aplicativo com segurança.",
      },
      { property: "og:title", content: "Perfil | FinNote" },
      { property: "og:description", content: "Sua conta no FinNote." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [hiddenFeatures, setHiddenFeatures] = useState<HomeFeatureId[]>(() =>
    getHiddenHomeFeatures(user.user_metadata),
  );
  const [savingFeature, setSavingFeature] = useState<HomeFeatureId | null>(null);

  async function handleFeatureToggle(featureId: HomeFeatureId, enabled: boolean) {
    if (savingFeature) return;

    const previousHiddenFeatures = hiddenFeatures;
    const nextHiddenFeatures = enabled
      ? hiddenFeatures.filter((hiddenFeature) => hiddenFeature !== featureId)
      : hiddenFeatures.includes(featureId)
        ? hiddenFeatures
        : [...hiddenFeatures, featureId];

    setHiddenFeatures(nextHiddenFeatures);
    setSavingFeature(featureId);

    try {
      const { error } = await supabase.auth.updateUser({
        data: { [HIDDEN_HOME_FEATURES_METADATA_KEY]: nextHiddenFeatures },
      });
      if (error) throw error;
    } catch {
      setHiddenFeatures(previousHiddenFeatures);
      toast.error("Não foi possível salvar essa preferência.");
    } finally {
      setSavingFeature(null);
    }
  }

  async function handleSignOut() {
    try {
      await Promise.all([cancelTaskNotifications(user.id), cancelDietNotifications(user.id)]);
    } catch {
      // O logout não deve ficar bloqueado se o sistema de notificações estiver indisponível.
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="px-5 pt-6">
        <h1 className="text-xl font-black tracking-[0.2em] text-foreground">PERFIL</h1>
      </header>

      <div className="mt-6 flex items-center gap-4 px-5">
        <span className="flex size-14 items-center justify-center rounded-full bg-card text-primary">
          <User className="size-7" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{user.email}</p>
          <p className="text-xs text-muted-foreground">Conta FinNote</p>
        </div>
      </div>

      <section className="px-5 pt-8" aria-labelledby="home-features-title">
        <h2
          id="home-features-title"
          className="text-sm font-black tracking-[0.16em] text-foreground"
        >
          FUNCIONALIDADES DA HOME
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Escolha quais atalhos aparecem na sua tela inicial.
        </p>

        <ul className="mt-4 overflow-hidden rounded-3xl border border-border bg-card">
          {HOME_FEATURES.map((feature) => {
            const enabled = !hiddenFeatures.includes(feature.id);
            const saving = savingFeature === feature.id;
            const labelId = `home-feature-${feature.id}`;

            return (
              <li
                key={feature.id}
                className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0"
              >
                <div>
                  <p id={labelId} className="text-sm font-bold text-foreground">
                    {feature.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {saving ? "Salvando..." : enabled ? "Ativado" : "Desativado"}
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => void handleFeatureToggle(feature.id, checked)}
                  disabled={savingFeature !== null}
                  aria-labelledby={labelId}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <div className="px-5 pt-8">
        <Button
          type="button"
          variant="outline"
          onClick={handleSignOut}
          className="h-12 w-full rounded-2xl"
        >
          <LogOut className="size-4" aria-hidden />
          Sair da conta
        </Button>
      </div>

      <BottomNav />
    </div>
  );
}
