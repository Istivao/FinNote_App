import { describe, expect, it } from "vitest";

import {
  addFix,
  breakSegment,
  currentPace,
  emptyTrack,
  formatPace,
  haversineMeters,
  stepTargetMeters,
  type GpsFix,
  type TrackState,
} from "./run-gps";

// ~0,0000090 graus de latitude ≈ 1 m.
const DEG_PER_METER = 1 / 111_195;

function fixAt(metersNorth: number, seconds: number, accuracy = 5): GpsFix {
  return {
    latitude: -23.55 + metersNorth * DEG_PER_METER,
    longitude: -46.63,
    accuracy,
    time: 1_700_000_000_000 + seconds * 1000,
  };
}

function run(fixes: GpsFix[], initial: TrackState = emptyTrack) {
  return fixes.reduce(addFix, initial);
}

describe("haversineMeters", () => {
  it("mede 1 grau de latitude como ~111 km", () => {
    const km = haversineMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }) / 1000;
    expect(km).toBeCloseTo(111.19, 1);
  });
});

describe("addFix", () => {
  it("soma a distância de uma corrida a 5 min/km", () => {
    // 3,33 m/s: um ponto por segundo durante 60 s.
    const fixes = Array.from({ length: 61 }, (_, s) => fixAt(s * (1000 / 300), s));
    const track = run(fixes);

    expect(track.meters).toBeCloseTo(200, 0);
    expect(track.movingMs).toBe(60_000);
    expect(currentPace(track)).toBeCloseTo(300, 0);
  });

  it("ignora pontos imprecisos", () => {
    const track = run([fixAt(0, 0), fixAt(50, 10, 80), fixAt(30, 10)]);
    expect(track.meters).toBeCloseTo(30, 0);
  });

  it("ignora saltos impossíveis do GPS", () => {
    const track = run([fixAt(0, 0), fixAt(500, 2), fixAt(6, 2)]);
    expect(track.meters).toBeCloseTo(6, 0);
  });

  it("não soma o jitter de quem está parado", () => {
    const fixes = Array.from({ length: 30 }, (_, s) => fixAt(s % 2 === 0 ? 0 : 1.5, s));
    expect(run(fixes).meters).toBe(0);
  });

  it("não soma o trecho percorrido durante a pausa", () => {
    const beforePause = run([fixAt(0, 0), fixAt(100, 30)]);
    const afterPause = run([fixAt(400, 120), fixAt(500, 150)], breakSegment(beforePause));

    expect(afterPause.meters).toBeCloseTo(200, 0);
    expect(afterPause.movingMs).toBe(60_000);
  });
});

describe("formatPace", () => {
  it("formata minutos e segundos por km", () => {
    expect(formatPace(332)).toBe("5'32\"");
    expect(formatPace(null)).toBe("—");
    expect(formatPace(45 * 60)).toBe("—");
  });
});

describe("stepTargetMeters", () => {
  it("converte a unidade da etapa", () => {
    expect(stepTargetMeters(1.5, "km")).toBe(1500);
    expect(stepTargetMeters(400, "m")).toBe(400);
    expect(stepTargetMeters(10, "min")).toBeNull();
  });
});
