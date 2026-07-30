/**
 * Registro de esporte — cronômetro, distância por GPS e calorias por MET.
 *
 * O desenho de honestidade é o do resto do app: distância só existe com GPS
 * de verdade (haversine sobre pontos medidos), o batimento é o da pulseira ao
 * vivo, e a caloria é ESTIMATIVA declarada — MET da modalidade × peso × tempo,
 * a mesma conta do compêndio de atividades físicas que todo mundo usa.
 */

export type SportKind =
  | 'corrida'
  | 'caminhada'
  | 'ciclismo'
  | 'trilha'
  | 'funcional'
  | 'futebol'
  | 'yoga'
  | 'corda';

export type Sport = {
  kind: SportKind;
  label: string;
  /** Metabolic Equivalent of Task — kcal/kg/h da modalidade. */
  met: number;
  /** Faz sentido medir distância? Funcional e yoga, não. */
  gps: boolean;
};

export const SPORTS: Sport[] = [
  { kind: 'corrida', label: 'Corrida', met: 9.8, gps: true },
  { kind: 'caminhada', label: 'Caminhada', met: 3.5, gps: true },
  { kind: 'ciclismo', label: 'Ciclismo', met: 7.5, gps: true },
  { kind: 'trilha', label: 'Trilha', met: 6.0, gps: true },
  { kind: 'funcional', label: 'Funcional', met: 8.0, gps: false },
  { kind: 'futebol', label: 'Futebol', met: 7.0, gps: true },
  { kind: 'yoga', label: 'Yoga', met: 2.5, gps: false },
  { kind: 'corda', label: 'Pular corda', met: 11.0, gps: false },
];

export type GeoPoint = { lat: number; lon: number; at: number };

const R_TERRA_M = 6_371_000;

/** Distância haversine entre dois pontos, em metros. */
export function distanceM(a: GeoPoint, b: GeoPoint): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_TERRA_M * Math.asin(Math.sqrt(h));
}

/**
 * Distância acumulada de uma trilha de pontos, descartando saltos de GPS.
 *
 * Salto de mais de 50 m entre amostras vizinhas (~18 km/h de corrida gera <15m
 * a cada 3s) é ruído de sinal, não movimento — somá-lo inflaria a distância de
 * quem correu perto de prédios.
 */
export function trackDistanceM(points: GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = distanceM(points[i - 1], points[i]);
    if (d < 50) total += d;
  }
  return total;
}

/** Calorias estimadas: MET × peso × horas. Estimativa declarada, nunca "medida". */
export function kcalFor(met: number, weightKg: number, elapsedMs: number): number {
  return Math.round(met * weightKg * (elapsedMs / 3_600_000));
}

/** `5'32"/km` — o ritmo do corredor. `null` sem distância que preste. */
export function paceMinPerKm(distanceMeters: number, elapsedMs: number): string | null {
  if (distanceMeters < 100) return null;
  const minPorKm = elapsedMs / 60_000 / (distanceMeters / 1000);
  if (!Number.isFinite(minPorKm) || minPorKm > 60) return null;
  const min = Math.floor(minPorKm);
  const seg = Math.round((minPorKm - min) * 60);
  return `${min}'${String(seg).padStart(2, '0')}"/km`;
}

/** `47:32` ou `1:07:32` — relógio de sessão. */
export function sportClock(elapsedMs: number): string {
  const s = Math.max(0, Math.floor(elapsedMs / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  return h > 0 ? `${h}:${mm}:${String(seg).padStart(2, '0')}` : `${mm}:${String(seg).padStart(2, '0')}`;
}
