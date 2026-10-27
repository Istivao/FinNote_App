import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, ImageUp, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RUN_INTENSITIES, type RunIntensity } from "@/lib/run-blocks";
import {
  formatPaceInput,
  listZonePaces,
  MAX_PACE_SEC,
  MIN_PACE_SEC,
  parsePaceInput,
  saveZonePaces,
  zonePacesQueryKey,
  type ZonePaces,
} from "@/lib/run-zone-paces";
import { deleteZoneImage, getZoneImage, uploadZoneImage } from "@/lib/zone-image";

const zoneImageKey = ["zone-image"] as const;

/** Botão pequeno que abre, em um popup, os paces e a imagem das zonas de treino do usuário. */
export function ZoneImageButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ver minhas zonas de treino"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-inactive text-primary"
      >
        <ImageIcon className="size-5" aria-hidden />
      </button>
      <ZoneDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function ZoneDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-3xl p-5">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle>Minhas zonas</DialogTitle>
          <DialogDescription>
            Os paces de cada zona guiam o treinador por voz durante a corrida.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="paces" className="flex min-h-0 flex-col">
          <TabsList className="grid h-12 w-full shrink-0 grid-cols-2 rounded-2xl bg-surface-inactive p-1.5">
            <TabsTrigger value="paces" className="h-full rounded-xl text-xs font-black">
              Paces
            </TabsTrigger>
            <TabsTrigger value="image" className="h-full rounded-xl text-xs font-black">
              Imagem
            </TabsTrigger>
          </TabsList>
          <TabsContent value="paces" className="mt-4 min-h-0 overflow-auto">
            <ZonePacesForm enabled={open} onBusyChange={setBusy} />
          </TabsContent>
          <TabsContent value="image" className="mt-4 flex min-h-0 flex-col gap-3">
            <ZoneImagePanel enabled={open} onBusyChange={setBusy} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

type PaceFields = Record<RunIntensity, { fast: string; slow: string }>;

function toFields(paces: ZonePaces): PaceFields {
  return Object.fromEntries(
    RUN_INTENSITIES.map((zone) => {
      const pace = paces[zone];
      return [
        zone,
        pace
          ? { fast: formatPaceInput(pace.fastSec), slow: formatPaceInput(pace.slowSec) }
          : { fast: "", slow: "" },
      ];
    }),
  ) as PaceFields;
}

/** Digitação só de números: "630" vira "06:30". */
function maskPace(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, -2).padStart(2, "0")}:${digits.slice(-2)}`;
}

/** Converte os campos em paces; devolve a mensagem de erro do primeiro campo inválido. */
function parseFields(fields: PaceFields): { paces: ZonePaces } | { error: string } {
  const paces: ZonePaces = {};
  for (const zone of RUN_INTENSITIES) {
    const { fast, slow } = fields[zone];
    if (!fast && !slow) continue;
    const fastSec = parsePaceInput(fast);
    const slowSec = parsePaceInput(slow);
    if (fastSec === null || slowSec === null) {
      return { error: `${zone}: preencha os dois paces no formato mm:ss.` };
    }
    if (Math.min(fastSec, slowSec) < MIN_PACE_SEC || Math.max(fastSec, slowSec) > MAX_PACE_SEC) {
      return { error: `${zone}: use paces entre 02:00 e 20:00 por km.` };
    }
    if (fastSec >= slowSec) {
      return { error: `${zone}: o primeiro pace (mais rápido) deve ser menor que o segundo.` };
    }
    paces[zone] = { fastSec, slowSec };
  }
  return { paces };
}

function ZonePacesForm({
  enabled,
  onBusyChange,
}: {
  enabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: zonePacesQueryKey,
    queryFn: listZonePaces,
    enabled,
    staleTime: Infinity,
  });
  const [fields, setFields] = useState<PaceFields>(() => toFields({}));

  useEffect(() => {
    if (data) setFields(toFields(data));
  }, [data]);

  const save = useMutation({
    mutationFn: saveZonePaces,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: zonePacesQueryKey });
      toast.success("Paces das zonas salvos!");
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => onBusyChange(save.isPending), [save.isPending, onBusyChange]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = parseFields(fields);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    save.mutate(result.paces);
  }

  if (isPending) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar os paces: {error.message}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-[3rem_1fr_1fr] gap-2 text-[10px] font-black tracking-[0.15em] text-muted-foreground">
        <span>ZONA</span>
        <span>MAIS RÁPIDO</span>
        <span>MAIS LENTO</span>
      </div>
      {RUN_INTENSITIES.map((zone) => (
        <div key={zone} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2">
          <span className="font-black text-primary">{zone}</span>
          {(["fast", "slow"] as const).map((side) => (
            <Input
              key={side}
              value={fields[zone][side]}
              onChange={(event) =>
                setFields((current) => ({
                  ...current,
                  [zone]: { ...current[zone], [side]: maskPace(event.target.value) },
                }))
              }
              inputMode="numeric"
              placeholder={side === "fast" ? "06:00" : "06:30"}
              aria-label={`${zone}: pace ${side === "fast" ? "mais rápido" : "mais lento"} (min/km)`}
              className="h-11 rounded-xl text-center tabular-nums"
            />
          ))}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Pace em minutos por km. Deixe em branco as zonas que não usa.
      </p>
      <Button
        type="submit"
        className="h-11 w-full rounded-2xl font-black"
        disabled={save.isPending}
      >
        {save.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Salvar paces
      </Button>
    </form>
  );
}

function ZoneImagePanel({
  enabled,
  onBusyChange,
}: {
  enabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const {
    data: image,
    isPending,
    error,
  } = useQuery({
    queryKey: zoneImageKey,
    queryFn: getZoneImage,
    enabled,
    staleTime: Infinity,
  });
  const imageUrl = useObjectUrl(image ?? null);

  const upload = useMutation({
    mutationFn: uploadZoneImage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: zoneImageKey });
      toast.success("Imagem das zonas salva!");
    },
    onError: (err) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: deleteZoneImage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: zoneImageKey });
      toast.success("Imagem removida.");
    },
    onError: (err) => toast.error(err.message),
  });

  const busy = upload.isPending || remove.isPending;
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) upload.mutate(file);
  }

  return (
    <>
      <div className="min-h-0 overflow-auto">
        {isPending || upload.isPending ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar a imagem: {error.message}
          </p>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt="Tabela com as minhas zonas de treino"
            className="w-full rounded-2xl"
          />
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-muted-foreground"
          >
            <ImageUp className="size-8" aria-hidden />
            <span className="text-sm font-semibold">Toque para carregar a imagem</span>
          </button>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {image && (
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 rounded-2xl"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            <ImageUp className="size-4" aria-hidden />
            Trocar imagem
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Remover imagem"
            className="h-11 rounded-2xl border-destructive text-destructive"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Remover a imagem das zonas?")) remove.mutate();
            }}
          >
            {remove.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-4" aria-hidden />
            )}
          </Button>
        </div>
      )}
    </>
  );
}

/** URL temporária para exibir um Blob; liberada quando o Blob muda. */
function useObjectUrl(blob: Blob | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}
