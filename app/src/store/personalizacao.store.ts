import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

import { horarioTipico, horariosDeRefeicao, menosMinutos } from '../domain/habitos';
import * as api from '../services/api.service';
import { cancelPrefix, scheduleDailyAt, scheduleWeeklyAt } from '../services/notifications.service';
import { useLifestyleStore } from './lifestyle.store';
import { useMealReminderStore } from './meal-reminder.store';

/**
 * Notificações PERSONALIZADAS — "quanto mais você usa, mais ele aprende".
 *
 * Pedido de testador (ago/2026), nos termos dele: "aprender com os hábitos de
 * uso e enviar notificações, como iFood e Uber; opcional e ativável". Ligado,
 * o app lê os últimos 30 dias — refeições, treinos e esportes registrados,
 * hora de dormir declarada — e agenda, do lado do celular, sem servidor:
 *
 * - refeições nos horários típicos (entra no lembrete de refeições existente);
 * - treino 30 min antes do horário típico, nos dias com treino no plano ou
 *   simplesmente todos os dias em que ele costuma treinar;
 * - cama 30 min antes da hora declarada;
 * - relatório da semana de sono, domingo às 20h.
 *
 * Desligado, cancela tudo o que agendou e não toca no que a pessoa configurou
 * à mão. Nada é inferido com menos de três ocorrências (ver `domain/habitos`).
 */
const ARQUIVO = 'notificacoes-personalizadas.v1.json';
const TREINO = 'personal-treino-';
const CAMA = 'personal-cama-';
const RELATORIO_SONO = 'personal-relatorio-sono';

type Aprendido = {
  refeicoes: string[];
  treino: string | null;
  cama: string | null;
  atualizadoEm: string | null;
  /**
   * O dia (YYYY-MM-DD) em que a pessoa já treinou, para não ser cobrada nele.
   *
   * "Notificação de treino enviada mas estou com treino já em andamento,
   * desconsidere caso o treino já tenha sido realizado no dia OU esteja em
   * andamento" (Leonardo, 25/08/2026). O lembrete é AGENDADO no aparelho e
   * dispara sem o app rodar, então não há como decidir na hora: quem cancela é
   * o começo do treino.
   */
  treinouEm?: string | null;
};

type State = {
  ligado: boolean;
  carregado: boolean;
  aprendido: Aprendido;
  carregar: () => Promise<void>;
  ligar: (ligado: boolean) => Promise<void>;
  /** Relê o uso e refaz os agendamentos. Barato; chame ao voltar ao primeiro plano. */
  aprender: () => Promise<void>;
  /** A pessoa começou ou concluiu um treino hoje: o lembrete de hoje sai. */
  treinouHoje: () => Promise<void>;
};

function gravar(estado: { ligado: boolean; aprendido: Aprendido }) {
  try {
    new File(Paths.document, ARQUIVO).write(JSON.stringify(estado));
  } catch {
    // Preferência perdida não pode derrubar o agendamento.
  }
}

const vazio: Aprendido = { refeicoes: [], treino: null, cama: null, atualizadoEm: null, treinouEm: null };

/** `YYYY-MM-DD` local. O lembrete é do DIA da pessoa, não do relógio UTC. */
function isoDeHoje(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const usePersonalizacaoStore = create<State>((set, get) => ({
  ligado: false,
  carregado: false,
  aprendido: vazio,

  carregar: async () => {
    if (get().carregado) return;
    try {
      const f = new File(Paths.document, ARQUIVO);
      if (f.exists) {
        const salvo = JSON.parse(await f.text()) as { ligado: boolean; aprendido?: Aprendido };
        set({ ligado: salvo.ligado, aprendido: salvo.aprendido ?? vazio });
      }
    } catch {
      // Arquivo corrompido = começa desligado.
    }
    set({ carregado: true });
  },

  ligar: async (ligado) => {
    set({ ligado });
    gravar({ ligado, aprendido: get().aprendido });
    if (ligado) {
      await get().aprender();
    } else {
      await cancelPrefix(TREINO);
      await cancelPrefix(CAMA);
      await cancelPrefix(RELATORIO_SONO, 1);
    }
  },

  treinouHoje: async () => {
    if (!get().carregado) await get().carregar();
    const hoje = isoDeHoje();
    if (get().aprendido.treinouEm === hoje) return;
    const aprendido = { ...get().aprendido, treinouEm: hoje };
    set({ aprendido });
    gravar({ ligado: get().ligado, aprendido });
    // Cancela o que já está agendado para hoje. O reagendamento normal, na
    // próxima volta ao primeiro plano, já nasce pulando o dia.
    if (get().ligado) await cancelPrefix(TREINO);
  },

  aprender: async () => {
    if (!get().carregado) await get().carregar();
    if (!get().ligado || !api.isAuthenticated()) return;
    const [refeicoes, execucoes, sessoes, noites] = await Promise.all([
      api.fetchMeals(30).catch(() => []),
      api.fetchExecutionHistory(30).catch(() => []),
      api.fetchSportSessions(30).catch(() => []),
      api.fetchHabitsHistory(7).catch(() => []),
    ]);

    const horariosRefeicao = horariosDeRefeicao(refeicoes.map((m) => Date.parse(m.at)).filter(Number.isFinite));
    const inicios = [
      ...execucoes.filter((e) => e.status === 'FINISHED').map((e) => Date.parse(e.startedAt)), ...sessoes.map((s) => Date.parse(s.startedAt)),
    ].filter(Number.isFinite);
    const treino = horarioTipico(inicios);
    const cama = horaDeDormir(useLifestyleStore.getState().answers.bedtime);

    const aprendido: Aprendido = { refeicoes: horariosRefeicao, treino, cama, atualizadoEm: new Date().toISOString() };
    set({ aprendido });
    gravar({ ligado: true, aprendido });

    // Refeições: entram no lembrete que já existe, para a pessoa ver e editar.
    if (horariosRefeicao.length > 0) {
      const lembrete = useMealReminderStore.getState();
      if (!lembrete.carregado) await lembrete.carregar();
      await useMealReminderStore.getState().aplicar(true, horariosRefeicao);
    }

    if (treino) {
      // Já treinou hoje: o lembrete começa amanhã. Cobrar quem está no meio do
      // treino é o tipo de aviso que ensina a desligar os avisos.
      const pularHoje = aprendido.treinouEm === isoDeHoje() ? 1 : 0;
      await scheduleDailyAt(
        TREINO,
        menosMinutos(treino, 30),
        {
          title: 'Quase hora do treino',
          body: `Você costuma treinar por volta das ${treino.replace(':', 'h')}. O de hoje está pronto.`,
          route: 'Plan',
        },
        3,
        pularHoje);
    } else {
      // Deixou de haver hábito (ou nunca houve, e a versão anterior inventou um):
      // o que já está agendado no aparelho precisa SAIR. Sem isto, um horário
      // errado continua tocando por dias depois de o app parar de acreditar nele.
      await cancelPrefix(TREINO);
    }
    if (cama) {
      await scheduleDailyAt(CAMA, menosMinutos(cama, 30), {
        title: 'Meia hora para a cama',
        body: 'Baixar a luz e largar a tela agora é o que mais pesa no sono profundo.',
        route: 'Sleep',
      });
    } else {
      await cancelPrefix(CAMA);
    }

    // Relatório da semana de sono — domingo à noite, com os números da semana.
    const comSono = noites.filter((n) => n.sleepScore != null && n.sleepMinutes != null);
    if (comSono.length >= 3) {
      const media = Math.round(comSono.reduce((s, n) => s + (n.sleepScore ?? 0), 0) / comSono.length);
      const melhor = comSono.reduce((a, b) => ((b.sleepScore ?? 0) > (a.sleepScore ?? 0) ? b : a));
      const horas = Math.round(comSono.reduce((s, n) => s + (n.sleepMinutes ?? 0), 0) / comSono.length / 6) / 10;
      await scheduleWeeklyAt(RELATORIO_SONO, 0, '20:00', {
        title: `Sua semana de sono: ${media} de média`,
        body: `${comSono.length} noites medidas, ${String(horas).replace('.', ',')} h por noite em média. Melhor noite: ${melhor.date.slice(8, 10)}/${melhor.date.slice(5, 7)} (${melhor.sleepScore}).`,
        route: 'Sleep',
      });
    }
  },
}));

/**
 * A hora de dormir do perfil vem como NÚMERO (hora cheia, 23 = 23h) ou como
 * texto `HH:MM`, conforme a versão do onboarding. Aqui vira sempre `HH:MM`.
 */
function horaDeDormir(valor: unknown): string | null {
  if (typeof valor === 'string' && /^\d{1,2}:\d{2}$/.test(valor)) return valor.padStart(5, '0');
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    if (valor >= 0 && valor <= 24) return `${String(Math.floor(valor) % 24).padStart(2, '0')}:${String(Math.round((valor % 1) * 60)).padStart(2, '0')}`;
    if (valor > 24 && valor < 1440) return `${String(Math.floor(valor / 60)).padStart(2, '0')}:${String(valor % 60).padStart(2, '0')}`;
  }
  return null;
}
