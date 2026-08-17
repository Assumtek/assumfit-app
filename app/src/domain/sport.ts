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
  | 'corda'
  | 'natacao'
  | 'lutas'
  | 'danca';

export type Sport = {
  kind: SportKind;
  label: string;
  /** Metabolic Equivalent of Task — kcal/kg/h da modalidade. */
  met: number;
  /** Faz sentido medir distância? Funcional e yoga, não. */
  gps: boolean;
  /** Glifo do conjunto do app (outline monolinear) — a pessoa praticando. */
  icon: string;
};

export const SPORTS: Sport[] = [
  { kind: 'corrida', label: 'Corrida', met: 9.8, gps: true, icon: 'footprints' },
  { kind: 'caminhada', label: 'Caminhada', met: 3.5, gps: true, icon: 'standing' },
  { kind: 'ciclismo', label: 'Ciclismo', met: 7.5, gps: true, icon: 'bike' },
  { kind: 'trilha', label: 'Trilha', met: 6.0, gps: true, icon: 'mountain' },
  { kind: 'funcional', label: 'Funcional', met: 8.0, gps: false, icon: 'dumbbell' },
  { kind: 'futebol', label: 'Futebol', met: 7.0, gps: true, icon: 'ball' },
  { kind: 'yoga', label: 'Yoga', met: 2.5, gps: false, icon: 'flower' },
  { kind: 'corda', label: 'Pular corda', met: 11.0, gps: false, icon: 'zap' },
  // As três chegaram com a fusão do plano com esportes (ago/2026): quem tem
  // plano de natação/luta/dança precisa registrar a sessão no mesmo lugar.
  { kind: 'natacao', label: 'Natação', met: 8.0, gps: false, icon: 'swim' },
  { kind: 'lutas', label: 'Lutas', met: 10.0, gps: false, icon: 'swords' },
  { kind: 'danca', label: 'Dança', met: 7.8, gps: false, icon: 'music' },
];

/**
 * O esporte do CRONÔMETRO que corresponde à modalidade de um treino do plano
 * — a ponte da coexistência (ago/2026): dia de esporte do plano pode ser
 * registrado pelo gravador, com GPS, caloria e batimento. Slug sem gravador
 * correspondente (musculação, mobilidade) devolve null e o dia segue só pelo
 * treino guiado.
 */
const MODALITY_TO_SPORT: Record<string, SportKind> = {
  corrida: 'corrida',
  caminhada: 'caminhada',
  ciclismo: 'ciclismo',
  natacao: 'natacao',
  futebol: 'futebol',
  lutas: 'lutas',
  danca: 'danca',
  crossfit: 'funcional',
  'esportes-coletivos': 'futebol',
  yoga: 'yoga',
};

export function sportForModality(modality: string | null | undefined): Sport | null {
  const kind = modality ? MODALITY_TO_SPORT[modality] : undefined;
  return kind ? (SPORTS.find((s) => s.kind === kind) ?? null) : null;
}

export type GeoPoint = { lat: number; lon: number; at: number };

/** Ponto do percurso como sobe ao servidor: só lat/lon, ~1 m de precisão. */
export type TrackPoint = { lat: number; lon: number };

/**
 * Minimização da trilha antes do envio (política de ago/2026: o percurso sobe
 * para o histórico desenhar o mapa em qualquer aparelho — como o Strava — mas
 * sobe REDUZIDO): amostragem uniforme até `max` pontos, sempre preservando o
 * último, e coordenadas arredondadas a 5 casas (~1 m). O instante de cada
 * ponto não viaja: o mapa não precisa de horário.
 */
export function simplifyTrack(points: GeoPoint[], max = 300): TrackPoint[] {
  if (points.length < 2) return [];
  const passo = Math.max(1, Math.ceil(points.length / max));
  const escolhidos: GeoPoint[] = [];
  for (let i = 0; i < points.length; i += passo) escolhidos.push(points[i]);
  if (escolhidos[escolhidos.length - 1] !== points[points.length - 1]) {
    escolhidos.push(points[points.length - 1]);
  }
  const arredondar = (v: number) => Math.round(v * 1e5) / 1e5;
  return escolhidos.map((p) => ({ lat: arredondar(p.lat), lon: arredondar(p.lon) }));
}

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

/**
 * A faixa de peso de referência enquanto o cadastro não tem balança.
 *
 * O peso é a variável que NÃO medimos na conta de MET — fingir precisão com um
 * número pontual seria a mesma desonestidade que a caloria por foto evita ao
 * aparecer como faixa. 60–85 kg cobre o grosso da população adulta; quem está
 * fora lê uma faixa um pouco deslocada, não um número falso.
 */
const PESO_MIN_KG = 60;
const PESO_MAX_KG = 85;

/** A faixa honesta de calorias da sessão: o peso desconhecido vira intervalo. */
export function kcalRange(met: number, elapsedMs: number): [number, number] {
  return [kcalFor(met, PESO_MIN_KG, elapsedMs), kcalFor(met, PESO_MAX_KG, elapsedMs)];
}

/** `180–255 kcal` — a faixa pronta para tela, com o traço do intervalo. */
export function kcalRangeLabel(met: number, elapsedMs: number): string {
  const [min, max] = kcalRange(met, elapsedMs);
  return `${min}–${max}`;
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
