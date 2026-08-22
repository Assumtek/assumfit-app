import { INTERVALO_MAXIMO_NA_NOITE_MS, montarNoites, type SegmentoComInstante } from '../sleep';

/** `h(21, 23, 30)` → 21/08/2026 23:30, hora local. */
const h = (dia: number, hora: number, min = 0) => new Date(2026, 7, dia, hora, min).getTime();
const seg = (phase: SegmentoComInstante['phase'], inicio: number, minutos: number): SegmentoComInstante => ({
  phase,
  minutes: minutos,
  startAt: inicio,
  endAt: inicio + minutos * 60_000,
});

describe('montarNoites', () => {
  it('a noite do Leo: levantou à 1h e voltou — é UMA noite, com o intervalo acordado', () => {
    // 23h30→0h29 num "dia" da memória; 1h30→6h45 no outro.
    const bloco1 = [seg('light', h(21, 23, 30), 31), seg('deep', h(22, 0, 1), 28)];
    const bloco2 = [seg('light', h(22, 1, 30), 40), seg('deep', h(22, 2, 10), 95), seg('rem', h(22, 3, 45), 180)];
    const noites = montarNoites([...bloco2, ...bloco1]);
    expect(noites).toHaveLength(1);
    const n = noites[0];
    expect(n.date).toBe('2026-08-21');
    expect(n.totalMin).toBe(31 + 28 + 40 + 95 + 180);
    // O intervalo em que levantou entra como acordado — 0h29 → 1h30 = 61 min.
    expect(n.phases.awake).toBe(61);
    expect(n.segments.map((s) => s.phase)).toEqual(['light', 'deep', 'awake', 'light', 'deep', 'rem']);
    expect(n.startAt).toBe(h(21, 23, 30));
    expect(n.endAt).toBe(h(22, 6, 45));
  });

  it('intervalo maior que o limite separa em duas noites (cochilo da tarde não é a noite)', () => {
    const noite = [seg('deep', h(21, 23, 0), 300)];
    const cochilo = [seg('light', h(22, 4, 0) + INTERVALO_MAXIMO_NA_NOITE_MS + 60_000, 40)];
    const noites = montarNoites([...noite, ...cochilo]);
    expect(noites).toHaveLength(2);
    // Mais recente primeiro.
    expect(noites[0].totalMin).toBe(40);
    expect(noites[1].totalMin).toBe(300);
  });

  it('o mesmo bloco vindo em dois dias da memória não conta duas vezes', () => {
    const bloco = [seg('light', h(21, 23, 30), 31), seg('deep', h(22, 0, 1), 28)];
    const noites = montarNoites([...bloco, ...bloco]);
    expect(noites).toHaveLength(1);
    expect(noites[0].totalMin).toBe(59);
  });

  it('a data é a da tarde em que a noite começou, mesmo começando depois da meia-noite', () => {
    expect(montarNoites([seg('light', h(22, 0, 40), 300)])[0].date).toBe('2026-08-21');
    expect(montarNoites([seg('light', h(21, 22, 0), 300)])[0].date).toBe('2026-08-21');
  });

  it('sem segmento válido, sem noite', () => {
    expect(montarNoites([])).toEqual([]);
    expect(montarNoites([seg('light', 0, 30)])).toEqual([]);
  });
});
