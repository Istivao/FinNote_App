import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const queryClient = new QueryClient();

function RoutePending() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background" aria-busy="true">
      <div
        className="size-9 animate-spin rounded-full border-4 border-primary/25 border-t-primary"
        role="status"
        aria-label="Carregando"
      />
    </div>
  );
}

export const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  // Começa a carregar a tela já no toque do link (antes de soltar o dedo).
  defaultPreload: "intent",
  defaultPreloadDelay: 0,
  defaultPreloadStaleTime: 0,
  // Se a rede demorar, troca de tela logo e mostra o indicador em vez de parecer travado.
  defaultPendingComponent: RoutePending,
  defaultPendingMs: 150,
  defaultPendingMinMs: 200,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
