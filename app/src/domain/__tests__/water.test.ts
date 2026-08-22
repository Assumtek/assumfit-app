import { diaCorrente, isoHoje, waterNudge, horariosPorIntervalo } from '../water';
import { WATER_NUDGE_PADRAO } from '../water';

const META = 2500;
const COPO = 200;

describe('waterNudge', () => {
  it('nenhuma água hoje: o lembrete DIZ isso, e não uma frase genérica', () => {
    const n = waterNudge(0, META, COPO);
    expect(n?.title).toBe('Você ainda não bebeu água hoje');
    expect(n?.body).toContain('200 ml');
    expect(n?.body).toContain('2,5 L');
  });

  it('meta batida não gera lembrete', () => {
    expect(waterNudge(META, META, COPO)).toBeNull();
    expect(waterNudge(META + 500, META, COPO)).toBeNull();
  });

  it('longe da meta, fala em volume: "12 copos" desanima', () => {
    const n = waterNudge(500, META, COPO);
    expect(n?.title).toBe('Hora da água');
    expect(n?.body).toContain('0,5 L de 2,5 L');
    expect(n?.body).toContain('2,0 L');
  });

  it('no último terço, fala em copos, é o que resta de gesto', () => {
    const n = waterNudge(1800, META, COPO);
    expect(n?.title).toBe('Faltam 0,7 L para a meta');
    expect(n?.body).toContain('4 copos');
  });

  it('um copo só de diferença usa o singular', () => {
    const n = waterNudge(2400, META, COPO);
    expect(n?.body).toContain('1 copo');
    expect(n?.body).not.toContain('1 copos');
  });

  it('a conta segue o copo CADASTRADO, não o padrão', () => {
    const n = waterNudge(1800, META, 350);
    expect(n?.body).toContain('2 copos');
  });

  it('a fronteira do terço separa as duas vozes, sem buraco entre elas', () => {
    // Um mililitro de cada lado: a fronteira não pode deixar faixa sem texto,
    // e comparar float com float na borda exata é armadilha, não requisito.
    expect(waterNudge(META - META / 3 - 1, META, COPO)?.title).toBe('Hora da água');
    expect(waterNudge(META - META / 3 + 1, META, COPO)?.title).toContain('Faltam');
  });
});

describe('isoHoje', () => {
  it('usa o calendário LOCAL, não o UTC', () => {
    // 22h de 17/ago no Brasil (UTC−3) já é 18/ago em UTC. `toISOString` daria
    // o dia seguinte, e a água da noite entraria no dia errado.
    const noite = new Date(2026, 7, 17, 22, 30);
    expect(isoHoje(noite)).toBe('2026-08-17');
  });

  it('preenche mês e dia com zero à esquerda', () => {
    expect(isoHoje(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
  });
});

describe('diaCorrente', () => {
  const ontem = { date: '2026-08-17', waterMl: 1800, pours: [200, 600, 1000] };

  it('virou o dia: zera o total e os goles', () => {
    /*
     O defeito relatado em campo: o app fica suspenso a noite toda, e de manhã
     a água de ontem continuava na tela. Zerar é o PADRÃO, não a consequência
     de encontrar um registro novo no servidor.
    */
    expect(diaCorrente(ontem, '2026-08-18')).toEqual({
      date: '2026-08-18',
      waterMl: 0,
      pours: [],
    });
  });

  it('mesmo dia: devolve a MESMA referência, para não re-renderizar à toa', () => {
    const hoje = { date: '2026-08-18', waterMl: 500, pours: [500] };
    expect(diaCorrente(hoje, '2026-08-18')).toBe(hoje);
  });

  it('atravessar mais de um dia também zera', () => {
    expect(diaCorrente(ontem, '2026-08-25').waterMl).toBe(0);
  });

  it('a data nova é a de hoje, e é nela que o próximo gole será gravado', () => {
    // Errar a data corrompe o histórico — é pior que mostrar número errado.
    expect(diaCorrente(ontem, '2026-08-18').date).toBe('2026-08-18');
  });
});

describe('horariosPorIntervalo', () => {
  it('gera de 30 em 30 das 8h às 21h, inclusivo', () => {
    const h = horariosPorIntervalo('08:00', '21:00', 30);
    expect(h[0]).toBe('08:00');
    expect(h[h.length - 1]).toBe('21:00');
    expect(h).toHaveLength(27);
  });

  it('janela invertida ou passo absurdo não gera nada', () => {
    expect(horariosPorIntervalo('21:00', '08:00', 30)).toEqual([]);
    expect(horariosPorIntervalo('08:00', '21:00', 0)).toEqual([]);
    expect(horariosPorIntervalo('xx', '21:00', 30)).toEqual([]);
  });

  it('respeita o teto de horários', () => {
    expect(horariosPorIntervalo('00:00', '23:59', 5).length).toBeLessThanOrEqual(30);
  });
});

describe('lembrete de água abre a tela da água', () => {
  // Leonardo (22/08): tocar na notificação não abria nada — o lembrete era a
  // única notificação do app sem rota. `App.tsx` navega por `data.route`.
  it('toda variante do lembrete carrega a rota de Hábitos', () => {
    expect(WATER_NUDGE_PADRAO.route).toBe('Habits');
    expect(waterNudge(0, 2100, 200)?.route).toBe('Habits');
    expect(waterNudge(1900, 2100, 200)?.route).toBe('Habits');
    expect(waterNudge(800, 2100, 200)?.route).toBe('Habits');
    // Meta batida não lembra nada — e portanto não abre nada.
    expect(waterNudge(2100, 2100, 200)).toBeNull();
  });
});
