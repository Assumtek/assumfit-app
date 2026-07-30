import { darkPalette, lightPalette } from '../../theme/palette';
import {
  formatClock,
  formatDuration,
  formatSessionClock,
  rateCompletion,
  rateConsistency,
  rateEffort,
  workoutColor,
  workoutMeta,
} from '../workout';

describe('formatação de tempo', () => {
  it('minutos abaixo de uma hora', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(45 * 60)).toBe('45 min');
    expect(formatDuration(59 * 60 + 20)).toBe('59 min');
  });

  it('hora cheia sem minuto pendurado', () => {
    expect(formatDuration(3600)).toBe('1h');
  });

  it('hora e minuto com dois dígitos', () => {
    expect(formatDuration(3600 + 5 * 60)).toBe('1h05');
    expect(formatDuration(4500)).toBe('1h15');
  });

  it('relógio do descanso', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(95)).toBe('1:35');
    // Negativo acontece quando o alvo já passou entre dois quadros.
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('conclusão da sessão', () => {
  it('ausência atravessa a avaliação intacta', () => {
    const rating = rateCompletion(null);
    expect(rating.available).toBe(false);
    expect(rating.label).toBe('—');
    expect(rating.fraction).toBe(0);
  });

  it('o destaque é palavra, o número é sub-label', () => {
    const rating = rateCompletion(87);
    expect(rating.label).toBe('Quase tudo');
    expect(rating.detail).toBe('87% das séries');
  });

  it.each([
    [100, 'Treino completo'],
    [96, 'Treino completo'],
    [80, 'Quase tudo'],
    [50, 'Meio caminho'],
    [10, 'Começou'],
  ])('%i%% → %s', (pct, label) => {
    expect(rateCompletion(pct).label).toBe(label);
  });

  it('nenhum degrau repreende quem treinou pouco', () => {
    // Sessão parcial é sessão. Um rótulo do tipo "insuficiente" aqui é o que
    // faz alguém não abrir o app de novo.
    const labels = [10, 50, 80, 100].map((p) => rateCompletion(p).label);
    for (const label of labels) {
      expect(label).not.toMatch(/ruim|insuficiente|fraco|falhou/i);
    }
  });

  it('sessão incompleta nunca vira alerta', () => {
    // `alert` é reservado para valor fora da faixa saudável. Treino pela metade
    // não é isso.
    for (const pct of [0, 25, 50, 75, 100]) {
      expect(rateCompletion(pct).state).toBe('normal');
    }
  });

  it('fração fica entre 0 e 1 mesmo com entrada fora de faixa', () => {
    expect(rateCompletion(140).fraction).toBe(1);
    expect(rateCompletion(-20).fraction).toBe(0);
  });
});

describe('esforço percebido', () => {
  it('traduz o número em palavra — ninguém sabe o que "7" significa', () => {
    expect(rateEffort(2).label).toBe('Leve');
    expect(rateEffort(5).label).toBe('Moderado');
    expect(rateEffort(8).label).toBe('Puxado');
    expect(rateEffort(10).label).toBe('No limite');
  });

  it('não informado não é zero', () => {
    expect(rateEffort(null).available).toBe(false);
    expect(rateEffort(null).detail).toBe('não informado');
  });
});

describe('constância', () => {
  it('fala em sessões por semana, não em total', () => {
    // "12 treinos" não diz nada sem o período — e é justo o número que um app
    // inflaria.
    expect(rateConsistency(12, 30).detail).toContain('por semana');
  });

  it('zero sessões é dito sem rodeio', () => {
    const rating = rateConsistency(0, 30);
    expect(rating.label).toBe('Sem treinos');
    expect(rating.fraction).toBe(0);
  });

  it.each([
    [18, 30, 'Constância alta'],
    [12, 30, 'Boa constância'],
    [6, 30, 'Irregular'],
    [2, 30, 'Poucos treinos'],
  ])('%i sessões em %i dias → %s', (sessions, days, label) => {
    expect(rateConsistency(sessions, days).label).toBe(label);
  });

  it('período inválido não vira divisão por zero', () => {
    expect(rateConsistency(5, 0).available).toBe(false);
  });
});

describe('cor', () => {
  it('recebe a paleta por parâmetro e funciona nos dois temas', () => {
    // O módulo é domínio puro: roda sem árvore React, e desde o tema dinâmico
    // não existe UMA paleta para importar.
    const rating = rateCompletion(90);
    expect(workoutColor(rating, darkPalette)).toBe(darkPalette.accent);
    expect(workoutColor(rating, lightPalette)).toBe(lightPalette.accent);
  });

  it('o acento é o mesmo nos dois temas', () => {
    expect(darkPalette.accent).toBe(lightPalette.accent);
  });
});

describe('linha de contexto do treino', () => {
  it('traduz o grupo muscular e conta os exercícios', () => {
    expect(workoutMeta(['PEITO', 'TRICEPS'], 6)).toBe('peito e tríceps · 6 exercícios');
  });

  it('singular quando é um só', () => {
    expect(workoutMeta(['ABDOMEN'], 1)).toBe('abdômen · 1 exercício');
  });

  it('corta em dois grupos para não virar duas linhas', () => {
    const meta = workoutMeta(['PEITO', 'TRICEPS', 'OMBROS', 'COSTAS'], 8);
    expect(meta).toBe('peito e tríceps · 8 exercícios');
    expect(meta).not.toContain('ombros');
  });

  it('sem grupo declarado ainda diz a quantidade', () => {
    expect(workoutMeta([], 4)).toBe('4 exercícios');
  });
});

describe('cronômetro da sessão', () => {
  it('minuto sempre com dois dígitos', () => {
    // Largura fixa: o número fica no cabeçalho e muda a cada segundo. Sem o
    // zero à esquerda ele oscila entre três e quatro dígitos ao passar de 9
    // minutos, e o que está à direita dança junto.
    expect(formatSessionClock(0)).toBe('00:00');
    expect(formatSessionClock(9)).toBe('00:09');
    expect(formatSessionClock(95)).toBe('01:35');
    expect(formatSessionClock(540)).toBe('09:00');
    expect(formatSessionClock(600)).toBe('10:00');
  });

  it('não vira horas — quem treina conta em minutos', () => {
    expect(formatSessionClock(3735)).toBe('62:15');
  });

  it('negativo não vira relógio ao contrário', () => {
    expect(formatSessionClock(-10)).toBe('00:00');
  });

  it('difere do relógio de descanso, que é curto e sem zero à esquerda', () => {
    expect(formatClock(95)).toBe('1:35');
    expect(formatSessionClock(95)).toBe('01:35');
  });
});
