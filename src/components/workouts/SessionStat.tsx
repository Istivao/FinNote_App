/** Cartão de estatística do resumo ao finalizar um treino. */
export function SessionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-black text-foreground">{value}</dd>
    </div>
  );
}
