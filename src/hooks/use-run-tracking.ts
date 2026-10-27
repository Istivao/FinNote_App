import { BackgroundGeolocation, type Location } from "@capgo/background-geolocation";
import { useEffect, useRef, useState } from "react";

import {
  addFix,
  breakSegment,
  emptyTrack,
  MAX_ACCURACY_METERS,
  type TrackState,
} from "@/lib/run-gps";

export type GpsStatus = "waiting" | "ok" | "weak" | "denied" | "unavailable";

/**
 * Rastreia o percurso da corrida pelo GPS. No Android roda num foreground service
 * (notificação fixa), então continua medindo com a tela apagada; no navegador o
 * plugin usa `navigator.geolocation`.
 */
export function useRunTracking({ active, paused }: { active: boolean; paused: boolean }) {
  const [track, setTrack] = useState<TrackState>(emptyTrack);
  const [status, setStatus] = useState<GpsStatus>("waiting");
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
    // Ao pausar, o próximo ponto recomeça o segmento em vez de somar o trecho da pausa.
    if (paused) setTrack(breakSegment);
  }, [paused]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    function onLocation(location?: Location, error?: { code?: string }) {
      if (cancelled) return;
      if (error) {
        setStatus(error.code === "NOT_AUTHORIZED" || error.code === "1" ? "denied" : "unavailable");
        return;
      }
      if (!location) return;

      setStatus(location.accuracy > MAX_ACCURACY_METERS ? "weak" : "ok");
      if (pausedRef.current) return;
      setTrack((state) =>
        addFix(state, {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          time: location.time ?? Date.now(),
        }),
      );
    }

    BackgroundGeolocation.start(
      {
        backgroundTitle: "Treino em andamento",
        backgroundMessage: "O FinNote está medindo sua corrida pelo GPS.",
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      },
      onLocation,
    ).catch((error: { code?: string }) => onLocation(undefined, error));

    return () => {
      cancelled = true;
      void BackgroundGeolocation.stop().catch(() => {
        // Já parado (ou nunca iniciado por falta de permissão).
      });
    };
  }, [active]);

  return { track, status };
}
