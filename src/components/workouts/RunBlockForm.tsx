import { Plus, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_RUN_BLOCKS,
  MAX_RUN_SETS,
  RUN_INTENSITIES,
  RUN_UNITS,
  describeRunBlock,
  type RunIntensity,
  type RunUnit,
} from "@/lib/run-blocks";
import {
  newRunBlock,
  parseRunDrafts,
  toDraftNumber,
  type RunBlockDraft,
} from "@/lib/workout-drafts";

type RunBlockFormProps = {
  blocks: RunBlockDraft[];
  onChange: (update: (current: RunBlockDraft[]) => RunBlockDraft[]) => void;
};

export function RunBlockForm({ blocks, onChange }: RunBlockFormProps) {
  function updateBlock(key: string, patch: Partial<RunBlockDraft>) {
    onChange((current) =>
      current.map((block) => (block.key === key ? { ...block, ...patch } : block)),
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-black tracking-[0.15em] text-primary">BLOCOS</h2>

      {blocks.map((block, index) => {
        const repeats = toDraftNumber(block.sets) > 1;
        const preview = parseRunDrafts([block]);
        return (
          <div key={block.key} className="rounded-3xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-lg font-black text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              {preview.ok && (
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-muted-foreground">
                  {describeRunBlock(preview.blocks[0]!)}
                </span>
              )}
              <button
                type="button"
                aria-label={`Remover bloco ${index + 1}`}
                onClick={() =>
                  onChange((current) => current.filter((item) => item.key !== block.key))
                }
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-inactive text-destructive"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>

            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-[6rem_1fr] gap-3">
                <div className="space-y-2">
                  <Label htmlFor={`run-sets-${block.key}`}>SÉRIES</Label>
                  <div className="relative">
                    <Input
                      id={`run-sets-${block.key}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_RUN_SETS}
                      step={1}
                      value={block.sets}
                      placeholder="1"
                      onChange={(event) => updateBlock(block.key, { sets: event.target.value })}
                      className="h-11 rounded-xl bg-surface-inactive pr-7"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                      x
                    </span>
                  </div>
                </div>
                <VolumeField
                  id={`run-volume-${block.key}`}
                  label="VOLUME ATIVO"
                  volume={block.volume}
                  unit={block.volumeUnit}
                  onVolumeChange={(volume) => updateBlock(block.key, { volume })}
                  onUnitChange={(volumeUnit) => updateBlock(block.key, { volumeUnit })}
                />
              </div>

              <IntensityPicker
                label="INTENSIDADE"
                value={block.intensity}
                onChange={(intensity) => intensity && updateBlock(block.key, { intensity })}
              />

              {repeats && (
                <div className="space-y-3 rounded-2xl border border-dashed border-border p-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    INTERVALO / RECUPERAÇÃO <span className="font-normal">(opcional)</span>
                  </p>
                  <IntensityPicker
                    label="INTENSIDADE DO INTERVALO"
                    value={block.recoveryIntensity}
                    allowEmpty
                    onChange={(recoveryIntensity) => updateBlock(block.key, { recoveryIntensity })}
                  />
                  {block.recoveryIntensity !== "" && (
                    <VolumeField
                      id={`run-recovery-${block.key}`}
                      label="VOLUME DO INTERVALO"
                      volume={block.recoveryVolume}
                      unit={block.recoveryUnit}
                      onVolumeChange={(recoveryVolume) =>
                        updateBlock(block.key, { recoveryVolume })
                      }
                      onUnitChange={(recoveryUnit) => updateBlock(block.key, { recoveryUnit })}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        disabled={blocks.length >= MAX_RUN_BLOCKS}
        onClick={() => onChange((current) => [...current, newRunBlock()])}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-4 text-sm font-semibold text-muted-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden />
        Adicionar bloco
      </button>
    </section>
  );
}

type IntensityPickerProps = {
  label: string;
  value: RunIntensity | "";
  /** Mostra a opção "Sem", que devolve "". */
  allowEmpty?: boolean;
  onChange: (value: RunIntensity | "") => void;
};

function IntensityPicker({ label, value, allowEmpty = false, onChange }: IntensityPickerProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {allowEmpty && (
          <IntensityChip active={value === ""} onClick={() => onChange("")}>
            Sem
          </IntensityChip>
        )}
        {RUN_INTENSITIES.map((intensity) => (
          <IntensityChip
            key={intensity}
            active={value === intensity}
            onClick={() => onChange(intensity)}
          >
            {intensity}
          </IntensityChip>
        ))}
      </div>
    </fieldset>
  );
}

function IntensityChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-w-11 rounded-full px-3 py-2 text-xs font-bold transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-surface-inactive text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

type VolumeFieldProps = {
  id: string;
  label: string;
  volume: string;
  unit: RunUnit;
  onVolumeChange: (volume: string) => void;
  onUnitChange: (unit: RunUnit) => void;
};

function VolumeField({ id, label, volume, unit, onVolumeChange, onUnitChange }: VolumeFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={volume}
          placeholder={unit === "m" ? "500" : unit === "km" ? "1" : "10"}
          onChange={(event) => onVolumeChange(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-xl bg-surface-inactive"
        />
        <select
          aria-label={`Unidade de ${label.toLowerCase()}`}
          value={unit}
          onChange={(event) => onUnitChange(event.target.value as RunUnit)}
          className="h-11 rounded-xl border border-input bg-surface-inactive px-3 text-sm font-bold text-foreground"
        >
          {RUN_UNITS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
