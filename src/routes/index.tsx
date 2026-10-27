import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import calendarioButton from "@/assets/calendario-button.jpg";
import dietaButton from "@/assets/dieta-button.jpg";
import financasButton from "@/assets/financas-button.jpg";
import gymHero from "@/assets/gym-hero.jpg";
import notasButton from "@/assets/notas-button.jpg";
import tarefasButton from "@/assets/tarefas-button.jpg";
import treinoButton from "@/assets/treino-button.jpg";
import { BottomNav } from "@/components/BottomNav";
import { supabase } from "@/integrations/supabase/client";
import { getHiddenHomeFeatures, HOME_FEATURES, type HomeFeatureId } from "@/lib/home-features";
import { cn } from "@/lib/utils";

const HOME_FEATURE_IMAGES = {
  treinos: treinoButton,
  calendario: calendarioButton,
  dieta: dietaButton,
  financas: financasButton,
  notas: notasButton,
  tarefas: tarefasButton,
} satisfies Record<HomeFeatureId, string>;

const HOME_CARD_CLASS =
  "col-span-2 aspect-square overflow-hidden rounded-[2rem] shadow-2xl transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background active:scale-95";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (error || !user) throw redirect({ to: "/auth" });
    return { hiddenHomeFeatures: getHiddenHomeFeatures(user.user_metadata) };
  },
  head: () => ({
    meta: [
      { title: "FinNote | Seus treinos de academia organizados" },
      {
        name: "description",
        content:
          "FinNote organiza seus treinos de academia por dia da semana: crie séries, repetições e acompanhe sua rotina no celular.",
      },
      { property: "og:title", content: "FinNote | Seus treinos de academia" },
      {
        property: "og:description",
        content: "Monte treinos por dia da semana, com séries e repetições, direto do celular.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { hiddenHomeFeatures } = Route.useRouteContext();
  const router = useRouter();
  const hiddenFeatureSet = new Set(hiddenHomeFeatures);
  const visibleFeatures = HOME_FEATURES.filter((feature) => !hiddenFeatureSet.has(feature.id));

  // Pré-carrega código e dados de cada funcionalidade em segundo plano, para que o toque no
  // card abra a tela na hora em vez de esperar a rede.
  useEffect(() => {
    for (const feature of HOME_FEATURES) {
      if (hiddenHomeFeatures.includes(feature.id)) continue;
      router.preloadRoute({ to: feature.to }).catch(() => undefined);
    }
  }, [router, hiddenHomeFeatures]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between overflow-hidden bg-background px-6 pb-28 pt-10">
      <img
        src={gymHero}
        alt="Halteres em um ambiente escuro de academia"
        width={1024}
        height={1536}
        className="pointer-events-none absolute inset-0 size-full object-cover opacity-30"
      />
      <div className="absolute inset-0 bg-background/70" aria-hidden />

      <header className="relative z-10 text-center">
        <p className="text-lg font-black tracking-[0.35em] text-foreground/80">
          FIN<span className="text-primary">NOTE</span>
        </p>
      </header>

      <div className="relative z-10 flex w-full flex-1 items-center justify-center">
        {visibleFeatures.length > 0 ? (
          <div className="grid w-full max-w-xl grid-cols-4 gap-4">
            {visibleFeatures.map((feature, index) => {
              const centerLastCard =
                visibleFeatures.length % 2 === 1 && index === visibleFeatures.length - 1;

              return (
                <Link
                  key={feature.id}
                  to={feature.to}
                  className={cn(HOME_CARD_CLASS, centerLastCard && "col-start-2")}
                >
                  <img
                    src={HOME_FEATURE_IMAGES[feature.id]}
                    alt={`Acessar ${feature.label.toLocaleLowerCase("pt-BR")}`}
                    width={640}
                    height={640}
                    className="size-full"
                  />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card/90 px-6 py-8 text-center shadow-2xl backdrop-blur">
            <p className="text-base font-black text-foreground">Sua Home está vazia</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Reative uma funcionalidade no Perfil para ela aparecer aqui.
            </p>
            <Link
              to="/perfil"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            >
              Gerenciar no Perfil
            </Link>
          </div>
        )}
      </div>

      <footer className="relative z-10 text-center text-sm font-bold tracking-[0.2em]">
        <h1 className="sr-only">FinNote — gerenciador de treinos de academia</h1>
        <span className="text-foreground">DISCIPLINA CONSTRÓI </span>
        <span className="text-primary">RESULTADOS.</span>
      </footer>

      <BottomNav />
    </main>
  );
}
