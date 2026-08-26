import { rateActivity, rateSleep, rateStress } from './ratings';
import type { SleepNight } from './types';

/**
 * Os cinco indicadores do dia na Home, cada um com DIREÇÃO (para cima ou
 * para baixo) e uma frase de avaliação.
 *
 * Proposta da fundadora (22/08/2026) no lugar do carrossel de cards: água,
 * atividade, alimentação, sono e estresse, lidos de relance. A direção é
 * binária de propósito: a pergunta da Home é "estou bem nisso hoje?", e a
 * nuance mora na tela de cada um. As réguas são as de `ratings.ts`; aqui
 * só se decide a seta e a frase.
 */

export type Direcao = 'up' | 'down';
export type Indicador = {
  key: 'agua' | 'atividade' | 'alimentacao' | 'sono' | 'stress';
  rotulo: string;
  direcao: Direcao;
  frase: string;
  rota: string;
};

export type EntradaIndicadores = {
  /** Hora local (0–23), para julgar o ritmo da água e dos passos. */
  hora: number;
  agua: { ml: number; metaMl: number };
  passos: { hoje: number | null; meta: number };
  /**
   * Minutos de treino guiado e esporte concluídos hoje.
   *
   * Existe porque passo não é a única forma de se mexer, e a régua de passos
   * sozinha dizia "pouco movimento, 40% da meta" a quem tinha acabado de fechar
   * uma hora de musculação (Leonardo, 25/08/2026). Musculação quase não produz
   * passo: contar só passos é medir a modalidade errada.
   */
  minutosDeTreino?: number;
  refeicoes: { quantidade: number; kcalMin: number; kcalMax: number; metaKcal: number | null };
  sono: SleepNight | null;
  stress: number | null;
};

/** Quanto do dia "útil" (7h às 22h) já passou, 0 a 1: é a régua do ritmo. */
function fracaoDoDia(hora: number): number {
  return Math.max(0, Math.min(1, (hora - 7) / 15));
}

export function indicadoresDaHome(e: EntradaIndicadores): Indicador[] {
  const ritmo = fracaoDoDia(e.hora);

  // Água: no ritmo quando o bebido acompanha a hora do dia (com folga de 30%).
  const pctAgua = e.agua.metaMl > 0 ? e.agua.ml / e.agua.metaMl : 0;
  const aguaOk = pctAgua >= 1 || (ritmo > 0 && pctAgua >= ritmo * 0.7);
  const agua: Indicador = {
    key: 'agua',
    rotulo: 'Água',
    direcao: aguaOk ? 'up' : 'down',
    frase:
      pctAgua >= 1
        ? 'Meta de água batida'
        : aguaOk
          ? `No ritmo, ${Math.round(pctAgua * 100)}% da meta`
          : e.agua.ml === 0
            ? 'Ainda não bebeu água hoje'
            : 'Bebeu pouca água hoje',
    rota: 'Habits',
  };

  /*
   Atividade: passos OU treino. Quem treinou já se mexeu, e a frase diz o que
   aconteceu em vez de cobrar a régua que aquela modalidade não preenche.

   O piso de vinte minutos é o que separa treino de check-in aberto por engano;
   abaixo disso a régua de passos volta a mandar.
  */
  const a = rateActivity({ steps: e.passos.hoje, goal: e.passos.meta });
  const pctPassos = e.passos.hoje != null && e.passos.meta > 0 ? e.passos.hoje / e.passos.meta : 0;
  const passosOk = pctPassos >= 1 || (ritmo > 0 && pctPassos >= ritmo * 0.6);
  const minutos = Math.round(e.minutosDeTreino ?? 0);
  const treinou = minutos >= 20;
  const atividade: Indicador = {
    key: 'atividade',
    rotulo: 'Atividade física',
    direcao: treinou || (a.available && passosOk) ? 'up' : 'down',
    frase: treinou
      ? `${minutos} min de treino hoje${a.available && pctPassos > 0 ? `, ${Math.round(pctPassos * 100)}% da meta de passos` : ''}`
      : !a.available
        ? 'Sem leitura de passos'
        : pctPassos >= 1
          ? 'Meta de passos batida'
          : passosOk
            ? `Em movimento, ${Math.round(pctPassos * 100)}% da meta de passos`
            : `Pouco movimento, ${Math.round(pctPassos * 100)}% da meta de passos`,
    rota: 'Activity',
  };

  // Alimentação: registrou e está perto da meta calórica (quando há meta).
  const r = e.refeicoes;
  const kcalMedio = (r.kcalMin + r.kcalMax) / 2;
  const alimOk = r.quantidade > 0 && (r.metaKcal == null || kcalMedio >= r.metaKcal * Math.max(0.4, ritmo * 0.7));
  const alimentacao: Indicador = {
    key: 'alimentacao',
    rotulo: 'Alimentação',
    direcao: alimOk ? 'up' : 'down',
    frase:
      r.quantidade === 0
        ? 'Nenhuma refeição registrada'
        : alimOk
          ? `${r.quantidade} ${r.quantidade === 1 ? 'refeição' : 'refeições'}, ${r.kcalMin}–${r.kcalMax} kcal`
          : 'Abaixo das calorias do dia',
    rota: 'Meals',
  };

  const s = rateSleep(e.sono?.score ?? null, e.sono?.totalMin ?? null);
  const sono: Indicador = {
    key: 'sono',
    rotulo: 'Sono',
    direcao: s.available && s.state === 'normal' && (e.sono?.score ?? 0) >= 60 ? 'up' : 'down',
    frase: !s.available ? 'Sem noite registrada' : (e.sono?.score ?? 0) >= 80 ? 'Ótima noite de sono' : (e.sono?.score ?? 0) >= 60 ? 'Boa noite de sono' : 'Noite abaixo do ideal',
    rota: 'Sleep',
  };

  const st = rateStress(e.stress);
  const stress: Indicador = {
    key: 'stress',
    rotulo: 'Stress',
    // Só "Calmo" sobe: a leitura é binária, e moderado já pede atenção.
    direcao: st.available && st.label === 'Calmo' ? 'up' : 'down',
    frase: !st.available ? 'Sem medição' : st.label,
    rota: 'Stress',
  };

  return [agua, atividade, alimentacao, sono, stress];
}
