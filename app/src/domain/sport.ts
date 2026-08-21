/**
 * Registro de esporte — cronômetro, distância por GPS e calorias por MET.
 *
 * O desenho de honestidade é o do resto do app: distância só existe com GPS
 * de verdade (haversine sobre pontos medidos), o batimento é o da pulseira ao
 * vivo, e a caloria é ESTIMATIVA declarada — MET da modalidade × peso × tempo,
 * a mesma conta do compêndio de atividades físicas que todo mundo usa.
 */

// Só o TIPO do glifo: o import é apagado na compilação, e o módulo segue sem
// dependência de árvore React — o que o mantém rodável em teste puro.
import type { IconName } from '../components/Icon';

export type SportKind =
  | 'corrida'
  | 'caminhada'
  | 'ciclismo'
  | 'trilha'
  | 'escalada'
  | 'skate'
  | 'musculacao'
  | 'funcional'
  | 'hiit'
  | 'spinning'
  | 'esteira'
  | 'eliptico'
  | 'remo'
  | 'corda'
  | 'natacao'
  | 'hidroginastica'
  | 'surfe'
  | 'futebol'
  | 'volei'
  | 'basquete'
  | 'tenis'
  | 'lutas'
  | 'danca'
  | 'yoga'
  | 'pilates'
  | 'alongamento';

/** Prateleira da grade de escolha — sem ela, 26 ícones viram uma parede. */
export type SportGroup = 'ar-livre' | 'academia' | 'agua' | 'quadra' | 'ritmo' | 'corpo';

export type Sport = {
  kind: SportKind;
  label: string;
  /** Metabolic Equivalent of Task — kcal/kg/h da modalidade. */
  met: number;
  /** Faz sentido medir distância? Só o que se desloca ao ar livre. */
  gps: boolean;
  /** Glifo do conjunto do app (outline monolinear) — a pessoa praticando. */
  icon: IconName;
  group: SportGroup;
};

/**
 * As modalidades e o MET de cada uma.
 *
 * Os valores são do **Compendium of Physical Activities** (Ainsworth et al.,
 * 2011) — o código do compêndio vai no fim da linha, porque número de saúde
 * sem procedência é chute com cara de dado. Onde o compêndio separa por
 * intensidade vale a linha MODERADA: o cronômetro mede a sessão inteira,
 * descanso entre séries incluído, e é ela que a conta de caloria multiplica.
 */
export const SPORTS: Sport[] = [
  { kind: 'corrida', label: 'Corrida', met: 9.8, gps: true, icon: 'footprints', group: 'ar-livre' }, // 12050 · 9,7 km/h
  { kind: 'caminhada', label: 'Caminhada', met: 3.5, gps: true, icon: 'standing', group: 'ar-livre' }, // 17190 · 5 km/h
  { kind: 'ciclismo', label: 'Ciclismo', met: 7.5, gps: true, icon: 'bike', group: 'ar-livre' }, // 01015
  { kind: 'trilha', label: 'Trilha', met: 6.0, gps: true, icon: 'mountain', group: 'ar-livre' }, // 17080
  { kind: 'escalada', label: 'Escalada', met: 8.0, gps: false, icon: 'climb', group: 'ar-livre' }, // 15533
  { kind: 'skate', label: 'Skate', met: 5.0, gps: false, icon: 'ramp', group: 'ar-livre' }, // 15580

  { kind: 'musculacao', label: 'Musculação', met: 5.0, gps: false, icon: 'dumbbell', group: 'academia' }, // 02061
  { kind: 'funcional', label: 'Funcional', met: 8.0, gps: false, icon: 'kettlebell', group: 'academia' }, // 02020
  { kind: 'hiit', label: 'HIIT', met: 8.0, gps: false, icon: 'timer', group: 'academia' }, // 02040
  { kind: 'spinning', label: 'Spinning', met: 8.5, gps: false, icon: 'bike', group: 'academia' }, // 02019
  { kind: 'esteira', label: 'Esteira', met: 8.3, gps: false, icon: 'gauge', group: 'academia' }, // 12030 · 8 km/h
  { kind: 'eliptico', label: 'Elíptico', met: 5.0, gps: false, icon: 'orbit', group: 'academia' }, // 02048
  { kind: 'remo', label: 'Remo', met: 6.0, gps: false, icon: 'boat', group: 'academia' }, // 02070
  { kind: 'corda', label: 'Pular corda', met: 11.8, gps: false, icon: 'zap', group: 'academia' }, // 15551

  { kind: 'natacao', label: 'Natação', met: 5.8, gps: false, icon: 'swim', group: 'agua' }, // 18240
  { kind: 'hidroginastica', label: 'Hidro', met: 5.5, gps: false, icon: 'pool', group: 'agua' }, // 18355
  { kind: 'surfe', label: 'Surfe', met: 3.0, gps: false, icon: 'palm', group: 'agua' }, // 18220

  { kind: 'futebol', label: 'Futebol', met: 7.0, gps: true, icon: 'ball', group: 'quadra' }, // 15610
  { kind: 'volei', label: 'Vôlei', met: 6.0, gps: false, icon: 'hand', group: 'quadra' }, // 15711
  { kind: 'basquete', label: 'Basquete', met: 6.5, gps: false, icon: 'target', group: 'quadra' }, // 15055
  { kind: 'tenis', label: 'Tênis', met: 7.3, gps: false, icon: 'circleDot', group: 'quadra' }, // 15675

  { kind: 'lutas', label: 'Lutas', met: 10.3, gps: false, icon: 'swords', group: 'ritmo' }, // 15430
  { kind: 'danca', label: 'Dança', met: 7.8, gps: false, icon: 'music', group: 'ritmo' }, // 03031

  { kind: 'yoga', label: 'Yoga', met: 2.5, gps: false, icon: 'flower', group: 'corpo' }, // 02150
  { kind: 'pilates', label: 'Pilates', met: 3.0, gps: false, icon: 'body', group: 'corpo' }, // 02105
  { kind: 'alongamento', label: 'Alongamento', met: 2.3, gps: false, icon: 'stretch', group: 'corpo' }, // 02101
];

const GROUP_LABEL: Record<SportGroup, string> = {
  'ar-livre': 'ar livre',
  academia: 'academia',
  agua: 'água',
  quadra: 'quadra e raquete',
  ritmo: 'luta e dança',
  corpo: 'corpo e mente',
};

const GROUP_ORDER: SportGroup[] = ['ar-livre', 'academia', 'agua', 'quadra', 'ritmo', 'corpo'];

export type SportSection = { group: SportGroup; label: string; sports: Sport[] };

/** As modalidades em prateleiras, na ordem em que a grade as mostra. */
export function sportSections(): SportSection[] {
  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABEL[group],
    sports: SPORTS.filter((s) => s.group === group),
  })).filter((sec) => sec.sports.length > 0);
}

/**
 * O que a pessoa DIGITA e não é o rótulo: apelido ("bike"), o nome da luta que
 * ela pratica ("muay thai") e a modalidade vizinha que o compêndio mede na
 * mesma linha — padel e beach tennis são tênis para efeito de MET.
 *
 * Sem isso, uma lista de 26 obriga a adivinhar como o app chamou o esporte.
 */
const SYNONYMS: Partial<Record<SportKind, string[]>> = {
  corrida: ['rua', 'run'],
  caminhada: ['andar'],
  ciclismo: ['bike', 'bicicleta', 'pedal'],
  trilha: ['trekking', 'montanha'],
  escalada: ['boulder'],
  skate: ['patins', 'longboard'],
  musculacao: ['academia', 'peso', 'forca', 'hipertrofia'],
  funcional: ['calistenia', 'peso do corpo'],
  hiit: ['crossfit', 'circuito', 'intervalado', 'tabata'],
  spinning: ['bike indoor', 'ciclismo indoor'],
  esteira: ['corrida indoor', 'indoor'],
  eliptico: ['transport', 'cardio'],
  remo: ['ergometro', 'caiaque'],
  corda: ['pular'],
  natacao: ['piscina', 'nado'],
  hidroginastica: ['hidroginastica', 'agua'],
  surfe: ['bodyboard', 'stand up', 'prancha'],
  futebol: ['futsal', 'society', 'pelada'],
  volei: ['volei de praia', 'futevolei'],
  basquete: ['basket'],
  tenis: ['raquete', 'padel', 'beach tennis', 'squash', 'badminton', 'frescobol'],
  lutas: ['boxe', 'muay thai', 'jiu-jitsu', 'judo', 'karate', 'mma', 'taekwondo'],
  danca: ['zumba', 'ritmos', 'forro', 'samba'],
  yoga: ['hatha'],
  pilates: ['solo', 'reformer'],
  alongamento: ['mobilidade', 'flexibilidade'],
};

/*
 Acento não pode ser barreira de busca: quem digita "musculacao" no teclado
 corrido tem de achar "Musculação". A tabela é escrita à mão porque o Hermes
 não garante `String.prototype.normalize`, e uma busca que só funciona no
 simulador é pior que nenhuma.
*/
const SEM_ACENTO: Record<string, string> = {
  á: 'a', à: 'a', ã: 'a', â: 'a', ä: 'a',
  é: 'e', ê: 'e', è: 'e',
  í: 'i', î: 'i',
  ó: 'o', ô: 'o', õ: 'o', ò: 'o',
  ú: 'u', ü: 'u',
  ç: 'c',
};

export function normalizeTerm(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/[áàãâäéêèíîóôõòúüç]/g, (c) => SEM_ACENTO[c] ?? c)
    .trim();
}

/** As modalidades que casam com o que foi digitado — rótulo, slug ou sinônimo. */
export function searchSports(query: string): Sport[] {
  const alvo = normalizeTerm(query);
  if (!alvo) return SPORTS;
  return SPORTS.filter(
    (s) =>
      normalizeTerm(s.label).includes(alvo) ||
      s.kind.includes(alvo) ||
      (SYNONYMS[s.kind] ?? []).some((t) => normalizeTerm(t).includes(alvo)),
  );
}

/**
 * O esporte do CRONÔMETRO que corresponde à modalidade de um treino do plano
 * — a ponte da coexistência (ago/2026): dia de esporte do plano pode ser
 * registrado pelo gravador, com GPS, caloria e batimento.
 *
 * **Musculação continua fora, e agora é escolha, não falta:** ela existe no
 * gravador para a sessão AVULSA, mas um dia de musculação do plano tem série,
 * carga e repetição, e só a tela guiada registra isso. Oferecer o cronômetro
 * ali concluiria o dia jogando o treino inteiro no lixo, com um número de
 * caloria no lugar. Mobilidade segue pela mesma razão.
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
  pilates: 'pilates',
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

/** `5'32"` — minutos por km, sem a unidade (quem mostra decide onde ela vai). */
export function formatPace(minPorKm: number): string | null {
  if (!Number.isFinite(minPorKm) || minPorKm <= 0 || minPorKm > 60) return null;
  const min = Math.floor(minPorKm);
  const seg = Math.round((minPorKm - min) * 60);
  return seg === 60 ? `${min + 1}'00"` : `${min}'${String(seg).padStart(2, '0')}"`;
}

/** `5'32"/km` — o ritmo MÉDIO da sessão. `null` sem distância que preste. */
export function paceMinPerKm(distanceMeters: number, elapsedMs: number): string | null {
  if (distanceMeters < 100) return null;
  const p = formatPace(elapsedMs / 60_000 / (distanceMeters / 1000));
  return p ? `${p}/km` : null;
}

/**
 * O ritmo AGORA: distância percorrida nos últimos `janelaMs`, pelos pontos de
 * GPS. É o número que o corredor olha durante a corrida — o médio só diz como
 * foi. Janela curta demais treme com o ruído do GPS; longa demais atrasa.
 * Sessenta segundos é o compromisso dos relógios de corrida.
 *
 * `null` quando a janela não tem dois pontos ou não saiu do lugar (parado no
 * semáforo): "ritmo infinito" não é informação.
 */
export function paceAtualMinPerKm(points: GeoPoint[], agoraMs: number, janelaMs = 60_000): string | null {
  const desde = agoraMs - janelaMs;
  const recentes = points.filter((p) => p.at >= desde && p.at <= agoraMs);
  if (recentes.length < 2) return null;
  const metros = trackDistanceM(recentes);
  const ms = recentes[recentes.length - 1].at - recentes[0].at;
  if (metros < 15 || ms < 10_000) return null;
  return formatPace(ms / 60_000 / (metros / 1000));
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


/** Depois disto, uma sessão interrompida é resto esquecido, não treino. */
export const LIMITE_RETOMADA_MS = 12 * 60 * 60 * 1000;

/**
 * Vale retomar a sessão que o app deixou pela metade?
 *
 * A sessão em curso passou a ser gravada em disco porque o iOS recolhe memória
 * de app em segundo plano — e uma partida longa com o celular no bolso é
 * exatamente quando ele recolhe. Mas retomar não pode ser incondicional: um
 * arquivo de três dias atrás reabriria um cronômetro absurdo e gravaria no
 * histórico um treino que ninguém fez.
 */
export function valeRetomar(startedAt: number | null | undefined, agora: number): boolean {
  if (!startedAt || startedAt > agora) return false;
  return agora - startedAt <= LIMITE_RETOMADA_MS;
}
