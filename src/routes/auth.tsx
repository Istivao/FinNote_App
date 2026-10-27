import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Dumbbell, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar no FinNote | Treinos de academia" },
      {
        name: "description",
        content:
          "Acesse sua conta FinNote para criar, organizar e acompanhar seus treinos de academia por dia da semana.",
      },
      { property: "og:title", content: "Entrar no FinNote" },
      {
        property: "og:description",
        content: "Entre ou crie sua conta e monte sua rotina de treinos no FinNote.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/", replace: true });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/treinos` },
        });
        if (error) throw error;
        toast.success("Conta criada! Se pedir confirmação, verifique seu e-mail.");
        navigate({ to: "/", replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Dumbbell className="size-7" aria-hidden />
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-foreground">
            Fin<span className="text-primary">Note</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Seus treinos, sempre com você.</p>
        </div>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-lg">
          <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-surface-inactive p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-xl py-2 text-sm font-semibold transition-colors ${
                  mode === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-MAIL</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                className="h-12 rounded-xl bg-surface-inactive"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">SENHA</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 rounded-xl bg-surface-inactive"
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl text-base font-bold"
            >
              {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
              {mode === "login" ? "ENTRAR" : "CRIAR CONTA"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
