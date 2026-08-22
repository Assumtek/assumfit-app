/**
 * Avaliação da sessão de treino.
 *
 * Vale a regra de ouro do design: o destaque é a avaliação em linguagem humana,
 * o número técnico é sub-label. Uma tela de fim de treino que mostrasse "87%"
 * grande estaria formatando número cru.
 *
 * O que NÃO passa por aqui: carga e repetição. Esses são ENTRADA da pessoa, não
 * métrica avaliada — 40 kg é 40 kg, e chamar isso de "bom" ou "regular" seria
 * julgar o esforço de alguém a partir de um número que o app não tem contexto
 * para julgar.
 */

import type { Palette } from '../theme/palette';
import type { Rating } from './ratings';

export type { Rating };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** `4500` → `1h15`. Minuto solto quando é menos de uma hora. */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h${String(minutes).padStart(2, '0')}`;
}

/** `95` → `1:35`. Para o cronômetro de descanso, que é curto. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * `95` → `01:35`. Para o cronômetro da SESSÃO.
 *
 * Minuto com zero à esquerda, e não é preciosismo: o número fica no cabeçalho e
 * muda a cada segundo. Sem a largura fixa ele oscila entre três e quatro
 * dígitos quando passa de 9 minutos, e tudo à direita dele dança junto.
 *
 * Não vira horas em nenhum momento — `62:15` é o certo para uma sessão de mais
 * de uma hora, porque quem está treinando conta em minutos.
 */
export function formatSessionClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/**
 * Quanto da sessão foi concluído.
 *
 * `state` fica sempre `normal`: a régua colorida aqui é dataviz, e sessão
 * incompleta não é valor fora de faixa saudável. `alert` continua reservado
 * para o que ele sempre foi.
 */
export function rateCompletion(completionPct: number | null): Rating {
  if (completionPct == null) {
    return { available: false, label: '–', detail: 'sem registro', fraction: 0, state: 'normal' };
  }

  const pct = clamp01(completionPct / 100);
  const detail = `${Math.round(completionPct)}% das séries`;

  // A escada é sobre a sessão, não sobre a pessoa. Nenhum degrau repreende:
  // quem fez metade do treino treinou, e o app que diz o contrário é o app que
  // ninguém abre de novo.
  if (completionPct >= 95) return { available: true, label: 'Treino completo', detail, fraction: pct, state: 'normal' };
  if (completionPct >= 70) return { available: true, label: 'Quase tudo', detail, fraction: pct, state: 'normal' };
  if (completionPct >= 40) return { available: true, label: 'Meio caminho', detail, fraction: pct, state: 'normal' };
  return { available: true, label: 'Começou', detail, fraction: pct, state: 'normal' };
}

/**
 * Percepção de esforço, na escala de Borg adaptada (1 a 10).
 *
 * É dado subjetivo declarado, e a leitura em palavra é o que ele significa —
 * ninguém sabe de cabeça o que "7" quer dizer numa escala de esforço.
 */
export function rateEffort(effort: number | null): Rating {
  if (effort == null) {
    return { available: false, label: '–', detail: 'não informado', fraction: 0, state: 'normal' };
  }

  const fraction = clamp01(effort / 10);
  const detail = `${effort} de 10`;
  if (effort <= 3) return { available: true, label: 'Leve', detail, fraction, state: 'normal' };
  if (effort <= 6) return { available: true, label: 'Moderado', detail, fraction, state: 'normal' };
  if (effort <= 8) return { available: true, label: 'Puxado', detail, fraction, state: 'normal' };
  return { available: true, label: 'No limite', detail, fraction, state: 'normal' };
}

/**
 * Constância na janela observada.
 *
 * Sessões por semana, não sessões totais: "12 treinos" não diz nada sem o
 * período, e é justamente o número que um app inflaria.
 */
export function rateConsistency(sessions: number, days: number): Rating {
  if (days <= 0) {
    return { available: false, label: '–', detail: 'sem período', fraction: 0, state: 'normal' };
  }

  const perWeek = (sessions / days) * 7;
  const detail = `${perWeek.toFixed(1).replace('.', ',')} por semana`;
  // Três por semana é o piso das diretrizes para adaptação de força; a régua
  // usa cinco como cheia porque acima disso a variável que importa deixa de ser
  // frequência e passa a ser recuperação.
  const fraction = clamp01(perWeek / 5);

  if (sessions === 0) {
    return { available: true, label: 'Sem treinos', detail: 'nenhuma sessão no período', fraction: 0, state: 'normal' };
  }
  if (perWeek >= 4) return { available: true, label: 'Constância alta', detail, fraction, state: 'normal' };
  if (perWeek >= 2.5) return { available: true, label: 'Boa constância', detail, fraction, state: 'normal' };
  if (perWeek >= 1) return { available: true, label: 'Irregular', detail, fraction, state: 'normal' };
  return { available: true, label: 'Poucos treinos', detail, fraction, state: 'normal' };
}

/**
 * Cor de uma avaliação de treino.
 *
 * Recebe a paleta por parâmetro, como `ratings.ts` — este módulo roda em teste
 * sem árvore React, e desde o tema dinâmico não existe UMA paleta para importar.
 */
export function workoutColor(rating: Rating, colors: Palette): string {
  return rating.state === 'alert' ? colors.alert : colors.accent;
}

/** Rótulo do dia da semana, no formato que a agenda do plano usa. */
export const DAY_LABEL: Record<string, string> = {
  MONDAY: 'segunda',
  TUESDAY: 'terça',
  WEDNESDAY: 'quarta',
  THURSDAY: 'quinta',
  FRIDAY: 'sexta',
  SATURDAY: 'sábado',
  SUNDAY: 'domingo',
};

export const DAY_SHORT: Record<string, string> = {
  MONDAY: 'seg',
  TUESDAY: 'ter',
  WEDNESDAY: 'qua',
  THURSDAY: 'qui',
  FRIDAY: 'sex',
  SATURDAY: 'sáb',
  SUNDAY: 'dom',
};

/** Ordem de exibição da semana. Segunda primeiro, como a semana de treino. */
export const WEEK_ORDER = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

const MUSCLE_LABEL: Record<string, string> = {
  PEITO: 'peito',
  COSTAS: 'costas',
  OMBROS: 'ombros',
  BICEPS: 'bíceps',
  TRICEPS: 'tríceps',
  ANTEBRACO: 'antebraço',
  ABDOMEN: 'abdômen',
  QUADRICEPS: 'quadríceps',
  POSTERIOR_COXA: 'posterior de coxa',
  GLUTEOS: 'glúteos',
  PANTURRILHA: 'panturrilha',
  CORPO_INTEIRO: 'corpo inteiro',
};

/**
 * Linha de contexto do treino: grupos musculares e quantidade de exercícios.
 *
 * Corta em dois grupos porque a lista completa de um treino de corpo inteiro
 * ocupa duas linhas e deixa de ser lida.
 */
export function workoutMeta(muscleGroups: string[], exerciseCount: number): string {
  const groups = muscleGroups.slice(0, 2).map((g) => MUSCLE_LABEL[g] ?? g.toLowerCase());
  const parts = groups.length > 0 ? [groups.join(' e ')] : [];
  parts.push(`${exerciseCount} ${exerciseCount === 1 ? 'exercício' : 'exercícios'}`);
  return parts.join(' · ');
}

export const PHASE_LABEL: Record<string, string> = {
  ALONGAMENTO: 'Preparo',
  TREINO: 'Treino',
  CARDIO: 'Cardio',
};

/**
 * Rótulo e ícone por modalidade do treino do dia (fusão musculação +
 * esportes, ago/2026). O slug vem do servidor em `workout.modality`.
 */
export const MODALITY_META: Record<string, { label: string; icon: string }> = {
  musculacao: { label: 'musculação', icon: 'dumbbell' },
  corrida: { label: 'corrida', icon: 'footprints' },
  caminhada: { label: 'caminhada', icon: 'standing' },
  ciclismo: { label: 'ciclismo', icon: 'bike' },
  natacao: { label: 'natação', icon: 'swim' },
  futebol: { label: 'futebol', icon: 'ball' },
  lutas: { label: 'lutas', icon: 'swords' },
  crossfit: { label: 'crossfit', icon: 'dumbbell' },
  /*
   Ícone NEUTRO ao grupo, e não o de um esporte dele.

   O slug é um balde: cobre tênis, padel, vôlei e basquete. Usar a bola de vôlei
   fazia a agenda mostrar vôlei para quem joga tênis — o lucide não tem raquete,
   e escolher um dos esportes do balde erra para todos os outros.
  */
  'esportes-coletivos': { label: 'quadra e raquete', icon: 'trophy' },
  yoga: { label: 'yoga', icon: 'flower' },
  danca: { label: 'dança', icon: 'music' },
};

/** Dia de esporte no plano? Null ou "musculacao" = treino de força clássico. */
export function isSportDay(modality: string | null | undefined): boolean {
  return !!modality && modality !== 'musculacao';
}

/** Meta da modalidade, com queda digna para slug desconhecido. */
export function modalityMeta(modality: string | null | undefined): { label: string; icon: string } {
  return (
    MODALITY_META[modality ?? 'musculacao'] ?? {
      label: (modality ?? 'treino').replace(/-/g, ' '),
      icon: 'flame',
    }
  );
}


/**
 * A linha de contexto SEM repetir o que o título já diz.
 *
 * O nome do treino costuma ser derivado dos grupos musculares — "Peito e
 * tríceps" —, e listar os grupos logo abaixo produzia "Peito e tríceps / peito
 * e tríceps · 6 exercícios". A repetição era o caso COMUM, não a exceção, e
 * fazia a peça de destaque parecer um erro de montagem.
 *
 * Quando o título já carrega os grupos, sobra a contagem. Quando não carrega, a
 * meta é a de sempre.
 */
export function workoutMetaSemRepetir(
  nome: string,
  muscleGroups: string[],
  exerciseCount: number): string {
  const completa = workoutMeta(muscleGroups, exerciseCount);
  const grupos = muscleGroups.slice(0, 2).map((g) => MUSCLE_LABEL[g] ?? g.toLowerCase());
  if (grupos.length === 0) return completa;

  const noTitulo = nome.toLowerCase();
  // Todos os grupos citados já aparecem no nome? Então eles são redundância.
  const repetido = grupos.every((g) => noTitulo.includes(g));
  if (!repetido) return completa;

  return `${exerciseCount} ${exerciseCount === 1 ? 'exercício' : 'exercícios'}`;
}
