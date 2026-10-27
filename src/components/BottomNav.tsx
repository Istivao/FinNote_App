import { Link } from "@tanstack/react-router";
import { House, TrendingUp, User } from "lucide-react";

const items = [
  { to: "/", label: "Home", icon: House },
  { to: "/progresso", label: "Progresso", icon: TrendingUp },
  { to: "/perfil", label: "Perfil", icon: User },
] as const;

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur"
      style={{
        paddingBottom: "var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <ul className="mx-auto flex max-w-md items-stretch">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              className="flex flex-col items-center gap-1 py-3 text-xs font-semibold text-muted-foreground transition-colors"
              activeOptions={{ exact: true }}
              activeProps={{ className: "text-primary" }}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
