import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import type { Lifestyle } from '../domain/onboarding';
import * as api from '../services/api.service';

/**
 * Cópia local do perfil.
 *
 * Sem ela o onboarding NÃO SOBREVIVIA a fechar o app: `completedAt` só existia
 * na memória e no servidor, e `load` desistia logo no começo quando não havia
 * sessão. A tela de conexão então lia `completedAt === null` e mandava a pessoa
 * responder tudo de novo, a cada pareamento.
 *
 * O comentário de `load` já dizia "sem rede o fluxo roda local e sincroniza
 * depois" — a intenção estava certa, faltava o local existir.
 *
 * `SecureStore` e não um arquivo qualquer porque isto é dado pessoal: ocupação,
 * horário de sono, rotina de treino. Não é biométrico, mas descreve a pessoa, e
 * o chaveiro do sistema é o lugar certo para guardar sem custo adicional.
 */
const CHAVE_LOCAL = 'lifestyle.v1';

type Persistido = { answers: Lifestyle; completedAt: string | null };

async function lerLocal(): Promise<Persistido | null> {
  try {
    const cru = await SecureStore.getItemAsync(CHAVE_LOCAL);
    return cru ? (JSON.parse(cru) as Persistido) : null;
  } catch {
    // Chaveiro indisponível ou conteúdo corrompido não pode impedir o app de
    // abrir — o pior caso volta a ser o de antes, refazer o onboarding.
    return null;
  }
}

function gravarLocal(dados: Persistido) {
  void SecureStore.setItemAsync(CHAVE_LOCAL, JSON.stringify(dados)).catch(() => undefined);
}

type LifestyleState = {
  answers: Lifestyle;
  /** `null` até a primeira carga; depois, a data em que o fluxo foi concluído. */
  completedAt: string | null;
  loaded: boolean;
  saving: boolean;

  load: () => Promise<void>;
  answer: (id: keyof Lifestyle, value: unknown) => void;
  finish: () => Promise<void>;
  /** Volta uma pergunta, apagando a resposta. */
  undo: (id: keyof Lifestyle) => void;
};

/** Converte o registro do servidor no formato de respostas do fluxo. */
function toAnswers(profile: api.LifestyleProfile | null): Lifestyle {
  if (!profile) return {};
  const answers: Lifestyle = {};
  // `null` no servidor significa "não respondida"; o fluxo usa `undefined`.
  // Sem esta conversão, uma pergunta pulada voltaria marcada como respondida e
  // o grafo saltaria por cima dela para sempre.
  if (profile.occupation !== null) answers.occupation = profile.occupation;
  if (profile.workPosture !== null) answers.workPosture = profile.workPosture;
  if (profile.postureHours !== null) answers.postureHours = profile.postureHours;
  if (profile.workSchedule !== null) answers.workSchedule = profile.workSchedule;
  if (profile.bedtime !== null) answers.bedtime = profile.bedtime;
  if (profile.exercises !== null) answers.exercises = profile.exercises;
  if (profile.blocker !== null) answers.blocker = profile.blocker;
  if (profile.activities.length) answers.activities = profile.activities;
  if (profile.trainDays.length) answers.trainDays = profile.trainDays;
  if (profile.trainPeriod !== null) answers.trainPeriod = profile.trainPeriod;
  if (profile.trainPlace !== null) answers.trainPlace = profile.trainPlace;
  if (profile.goal !== null) answers.goal = profile.goal;
  return answers;
}

/**
 * Respostas do onboarding.
 *
 * A escrita é otimista e por resposta: a tela avança no toque e a rede vai
 * atrás. Travar a interface esperando confirmação a cada pergunta transformaria
 * um fluxo de oito toques numa espera de oito requisições — e a resposta já
 * está guardada localmente de qualquer forma.
 */
export const useLifestyleStore = create<LifestyleState>((set, get) => ({
  answers: {},
  completedAt: null,
  loaded: false,
  saving: false,

  load: async () => {
    // O local vem PRIMEIRO e sempre. É o que faz o onboarding sobreviver a app
    // fechado, sessão expirada e servidor fora do ar — três situações em que a
    // versão anterior simplesmente perguntava tudo de novo.
    const local = await lerLocal();
    if (local) set({ answers: local.answers, completedAt: local.completedAt, loaded: true });

    if (!api.isAuthenticated()) {
      set({ loaded: true });
      return;
    }

    try {
      const profile = await api.fetchLifestyle();
      const doServidor = profile?.completedAt ?? null;

      /*
       Servidor sem conclusão + local concluído = escrita que se perdeu.

       Acontece quando a pessoa responde offline ou a requisição final falha. O
       certo é reenviar, não rebaixar o estado local: rebaixar mandaria refazer
       um onboarding que ela já fez, que é exatamente o incômodo que estamos
       corrigindo.
       */
      if (!doServidor && local?.completedAt) {
        void api.saveLifestyle({ ...local.answers, completed: true }).catch(() => undefined);
        set({ loaded: true });
        return;
      }

      const answers = toAnswers(profile);
      set({ answers, completedAt: doServidor, loaded: true });
      gravarLocal({ answers, completedAt: doServidor });
    } catch {
      // Sem rede o fluxo roda com o que está no aparelho e sincroniza depois.
      set({ loaded: true });
    }
  },

  answer: (id, value) => {
    const answers = { ...get().answers, [id]: value };
    set({ answers, saving: true });
    gravarLocal({ answers, completedAt: get().completedAt });
    void api
      .saveLifestyle({ [id]: value })
      .catch(() => undefined)
      .finally(() => set({ saving: false }));
  },

  finish: async () => {
    const completedAt = new Date().toISOString();
    set({ completedAt });
    // Grava a conclusão ANTES da rede: é o registro que impede a pessoa de
    // repetir o fluxo, e ele não pode depender de a requisição dar certo.
    gravarLocal({ answers: get().answers, completedAt });
    // O envio final repete TODAS as respostas, não só a marca de conclusão:
    // se alguma escrita otimista tiver falhado no caminho, esta é a chance de
    // o servidor receber o perfil inteiro.
    await api.saveLifestyle({ ...get().answers, completed: true }).catch(() => undefined);
  },

  undo: (id) => {
    const answers = { ...get().answers };
    delete answers[id];
    set({ answers });
    gravarLocal({ answers, completedAt: get().completedAt });
    void api.saveLifestyle({ [id]: null }).catch(() => undefined);
  },
}));
