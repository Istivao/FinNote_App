export const HOME_FEATURES = [
  { id: "treinos", label: "Treinos", to: "/treinos" },
  { id: "calendario", label: "Calendário", to: "/calendario" },
  { id: "dieta", label: "Dieta", to: "/dieta" },
  { id: "financas", label: "Finanças", to: "/financas" },
  { id: "notas", label: "Notas", to: "/notas" },
  { id: "tarefas", label: "Tarefas", to: "/tarefas" },
] as const;

export type HomeFeatureId = (typeof HOME_FEATURES)[number]["id"];

export const HIDDEN_HOME_FEATURES_METADATA_KEY = "hidden_home_features";

const HOME_FEATURE_IDS = new Set<string>(HOME_FEATURES.map((feature) => feature.id));

function isHomeFeatureId(value: unknown): value is HomeFeatureId {
  return typeof value === "string" && HOME_FEATURE_IDS.has(value);
}

export function getHiddenHomeFeatures(metadata: Record<string, unknown> | null | undefined) {
  const hiddenFeatures = metadata?.[HIDDEN_HOME_FEATURES_METADATA_KEY];
  if (!Array.isArray(hiddenFeatures)) return [];

  return [...new Set(hiddenFeatures.filter(isHomeFeatureId))];
}
