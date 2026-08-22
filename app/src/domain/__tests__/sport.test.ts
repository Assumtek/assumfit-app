import { movementMinutes } from '../movement';
import {
  SPORTS,
  kcalFor,
  kcalRange,
  kcalRangeLabel,
  paceMinPerKm,
  searchSports,
  simplifyTrack,
  sportClock,
  sportForModality,
  sportSections,
  trackDistanceM,
  type GeoPoint,
  type SportKind,
  valeRetomar, paceAtualMinPerKm, formatPace } from '../sport';

describe('esporte', () => {
  it('distância acumulada descarta salto de GPS', () => {
    const base = { lat: -23.55, lon: -46.63, at: 0 };
    const perto = { lat: -23.5501, lon: -46.63, at: 3000 }; // ~11 m
    const salto = { lat: -23.56, lon: -46.63, at: 6000 }; // ~1,1 km — ruído
    const d = trackDistanceM([base, perto, salto]);
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(20);
  });

  it('caloria é MET × peso × horas, arredondada', () => {
    // Corrida (9.8) × 70 kg × 0,5 h = 343.
    expect(kcalFor(9.8, 70, 30 * 60_000)).toBe(343);
  });

  it('faixa de caloria abre o peso desconhecido em intervalo', () => {
    // Corrida (9.8) × 0,5 h: 60 kg → 294, 85 kg → 417. O 70 kg pontual (343)
    // cai DENTRO da faixa — a faixa não muda a conta, declara a incerteza.
    expect(kcalRange(9.8, 30 * 60_000)).toEqual([294, 417]);
    expect(kcalRangeLabel(9.8, 30 * 60_000)).toBe('294–417');
    const [min, max] = kcalRange(9.8, 30 * 60_000);
    expect(kcalFor(9.8, 70, 30 * 60_000)).toBeGreaterThan(min);
    expect(kcalFor(9.8, 70, 30 * 60_000)).toBeLessThan(max);
  });

  it('ritmo formata min/km e some sem distância', () => {
    expect(paceMinPerKm(5000, 25 * 60_000)).toBe(`5'00"/km`);
    expect(paceMinPerKm(50, 60_000)).toBeNull();
  });

  it('relógio muda de forma com hora cheia', () => {
    expect(sportClock(95_000)).toBe('1:35');
    expect(sportClock(3_695_000)).toBe('1:01:35');
  });
});

describe('catálogo de modalidades', () => {
  it('nenhum slug repetido, e todo esporte tem MET, rótulo e ícone', () => {
    const kinds = SPORTS.map((s) => s.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const s of SPORTS) {
      expect(s.met).toBeGreaterThan(0);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.icon.length).toBeGreaterThan(0);
    }
  });

  it('toda modalidade cai em exatamente uma prateleira da grade', () => {
    const nasPrateleiras = sportSections().flatMap((sec) => sec.sports.map((s) => s.kind));
    expect(nasPrateleiras.sort()).toEqual(SPORTS.map((s) => s.kind).sort());
    expect(new Set(nasPrateleiras).size).toBe(nasPrateleiras.length);
  });

  it('GPS só para quem se desloca ao ar livre', () => {
    const comGps = SPORTS.filter((s) => s.gps).map((s) => s.kind);
    expect(comGps.sort()).toEqual(['caminhada', 'ciclismo', 'corrida', 'futebol', 'trilha']);
  });
});

describe('musculação avulsa', () => {
  const musculacao = SPORTS.find((s) => s.kind === 'musculacao')!;

  it('existe no gravador e não pede GPS', () => {
    expect(musculacao).toBeDefined();
    expect(musculacao.gps).toBe(false);
    expect(musculacao.met).toBe(5.0);
  });

  it('uma hora de sessão vira faixa de caloria, não número cravado', () => {
    // 5,0 MET × 1 h: 60 kg → 300, 85 kg → 425.
    expect(kcalRangeLabel(musculacao.met, 3_600_000)).toBe('300–425');
  });

  it('dia de musculação DO PLANO continua sem gravador, a série é do treino guiado', () => {
    expect(sportForModality('musculacao')).toBeNull();
    expect(sportForModality('mobilidade')).toBeNull();
    expect(sportForModality('corrida')?.kind).toBe('corrida');
  });

  it('a sessão sem plano entra na agenda de movimento', () => {
    const minutos = movementMinutes(
      [],
      [
        {
          startedAt: new Date(2026, 7, 12, 19, 0).toISOString(),
          durationS: 50 * 60,
          workoutExecutionId: null,
        },
      ]);
    expect(minutos.get('2026-08-12')).toBe(50);
  });
});

describe('busca de modalidade', () => {
  const kinds = (q: string): SportKind[] => searchSports(q).map((s) => s.kind);

  it('acha sem acento e sem caixa, o teclado corrido não digita "ç"', () => {
    expect(kinds('musculacao')).toContain('musculacao');
    expect(kinds('MUSCULAÇÃO')).toContain('musculacao');
    expect(kinds('natacao')).toContain('natacao');
  });

  it('acha pelo nome que a pessoa usa, não pelo rótulo', () => {
    expect(kinds('crossfit')).toContain('hiit');
    expect(kinds('padel')).toContain('tenis');
    expect(kinds('muay thai')).toContain('lutas');
    expect(kinds('bike')).toContain('ciclismo');
  });

  it('busca vazia é o catálogo inteiro; nome que não existe não devolve nada', () => {
    expect(searchSports('')).toHaveLength(SPORTS.length);
    expect(searchSports('   ')).toHaveLength(SPORTS.length);
    expect(searchSports('curling')).toEqual([]);
  });
});

const ponto = (i: number): GeoPoint => ({
  lat: -25.4 + i * 0.0001,
  lon: -49.2 + i * 0.0001,
  at: i * 1000,
});

describe('simplifyTrack', () => {
  it('menos de 2 pontos não é percurso', () => {
    expect(simplifyTrack([])).toEqual([]);
    expect(simplifyTrack([ponto(0)])).toEqual([]);
  });

  it('trilha curta passa inteira, sem o instante e com 5 casas', () => {
    const saida = simplifyTrack([ponto(0), ponto(1)]);
    expect(saida).toEqual([
      { lat: -25.4, lon: -49.2 },
      { lat: -25.3999, lon: -49.1999 },
    ]);
    expect(Object.keys(saida[0])).toEqual(['lat', 'lon']);
  });

  it('trilha longa é reduzida ao teto, preservando o último ponto', () => {
    const pontos = Array.from({ length: 5000 }, (_, i) => ponto(i));
    const saida = simplifyTrack(pontos, 300);
    expect(saida.length).toBeLessThanOrEqual(301);
    expect(saida[saida.length - 1]).toEqual({
      lat: Math.round(pontos[4999].lat * 1e5) / 1e5,
      lon: Math.round(pontos[4999].lon * 1e5) / 1e5,
    });
  });
});


/**
 * Retomar a sessão que o app deixou pela metade.
 *
 * O iOS recolhe memória de app em segundo plano sem avisar, e a sessão de
 * esporte vivia só em estado do React — quanto mais longo o treino, maior a
 * chance de perdê-lo inteiro. Relatado em produção (ago/2026): partida de tênis
 * iniciada pelo app e nenhum registro.
 */
describe('valeRetomar', () => {
  const AGORA = 1_700_000_000_000;

  it('sessão de uma hora atrás retoma, é o caso que motivou tudo', () => {
    expect(valeRetomar(AGORA - 60 * 60_000, AGORA)).toBe(true);
  });

  it('sessão de três dias atrás NÃO retoma: é resto, não treino', () => {
    expect(valeRetomar(AGORA - 3 * 24 * 60 * 60_000, AGORA)).toBe(false);
  });

  it('exatamente no limite ainda vale; um milissegundo além, não', () => {
    expect(valeRetomar(AGORA - 12 * 60 * 60_000, AGORA)).toBe(true);
    expect(valeRetomar(AGORA - 12 * 60 * 60_000 - 1, AGORA)).toBe(false);
  });

  it('início no futuro é relógio bagunçado, não sessão', () => {
    expect(valeRetomar(AGORA + 60_000, AGORA)).toBe(false);
    expect(valeRetomar(null, AGORA)).toBe(false);
    expect(valeRetomar(undefined, AGORA)).toBe(false);
  });
});

describe('ritmo atual', () => {
  // 100 m a cada 30 s para leste ≈ 5'00\"/km. Um grau de longitude no equador
  // tem ~111 km; 100 m ≈ 0,0009°.
  const corrida = (n: number, passoSeg: number, passoGraus: number, inicio = 0) =>
    Array.from({ length: n }, (_, i) => ({ lat: 0, lon: i * passoGraus, at: inicio + i * passoSeg * 1000 }));

  it('usa só a janela recente', () => {
    // Começo rápido (~30 m a cada 10 s ≈ 5'30"/km); fim lento (~30 m a cada
    // 30 s ≈ 16'40"/km). Passos abaixo de 50 m para não caírem no filtro de
    // salto de GPS do `trackDistanceM`.
    const pontos = [...corrida(10, 10, 0.00027), ...corrida(3, 30, 0.00027, 300_000)];
    const agora = paceAtualMinPerKm(pontos, 360_000);
    expect(agora).toMatch(/^1[5-7]'/);
    // E a janela no começo da corrida lê o ritmo rápido.
    expect(paceAtualMinPerKm(pontos, 90_000)).toMatch(/^5'/);
  });

  it('parado no semáforo não tem ritmo', () => {
    const parado = Array.from({ length: 5 }, (_, i) => ({ lat: 0, lon: 0, at: i * 15_000 }));
    expect(paceAtualMinPerKm(parado, 60_000)).toBeNull();
  });

  it('sem dois pontos na janela, nada', () => {
    expect(paceAtualMinPerKm(corrida(1, 30, 0.0009), 60_000)).toBeNull();
  });

  it('formata arredondando os segundos sem virar 60', () => {
    expect(formatPace(5.999)).toBe("6'00\"");
    expect(formatPace(0)).toBeNull();
  });
});
