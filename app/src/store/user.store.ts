import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

import type { User } from '../domain/types';
import * as api from '../services/api.service';

type Mood = 'great' | 'ok' | 'tired' | 'bad';

type UserState = {
  user: User;
  /** Perfil completo do servidor. Nulo até a primeira carga — ou sem rede. */
  profile: api.Profile | null;
  loading: boolean;
  mood: Mood | null;
  /** `file://` da foto de perfil, local ao aparelho. Nulo sem foto. */
  avatarUri: string | null;
  setMood: (mood: Mood) => void;
  age: () => number;
  load: () => Promise<void>;
  /** Esquece o perfil — ao sair da conta ou quando o servidor encerra a sessão. */
  clear: () => void;
  save: (patch: api.ProfilePatch) => Promise<boolean>;
  setAvatar: (pickedUri: string) => Promise<void>;
};

/**
 * O que vale antes de o perfil chegar.
 *
 * SEM NOME. Havia um "Rafael" aqui — um perfil de demonstração que ficava na
 * tela enquanto `/auth/me` não respondia, e que em ago/2026 apareceu para a
 * fundadora depois de uma atualização do TestFlight como se o app a tivesse
 * logado em outra conta. Nome inventado numa tela de saúde é exatamente o dado
 * de exemplo que este projeto baniu. Idade e sexo continuam com um padrão
 * porque as faixas de referência precisam de algum — e, diferente do nome,
 * ninguém os lê como identidade; e o perfil REAL agora é guardado em disco, de
 * modo que este padrão só vale na primeira abertura de uma conta nova.
 */
const DEFAULT_USER: User = {
  name: '',
  birthYear: 1994,
  sex: 'm',
};

/** Cópia local do último perfil carregado — a tela não espera a rede para saber quem é a pessoa. */
const ARQUIVO_PERFIL = 'perfil.v1.json';

async function lerPerfilLocal(): Promise<api.Profile | null> {
  try {
    const f = new File(Paths.document, ARQUIVO_PERFIL);
    return f.exists ? (JSON.parse(await f.text()) as api.Profile) : null;
  } catch {
    return null;
  }
}

function gravarPerfilLocal(profile: api.Profile | null): void {
  try {
    const f = new File(Paths.document, ARQUIVO_PERFIL);
    if (profile) f.write(JSON.stringify(profile));
    else if (f.exists) f.delete();
  } catch {
    // Disco é conveniência: sem ele o perfil volta pela rede na próxima carga.
  }
}

/** `1994-03-12` → 1994. Só o ano importa para a faixa de referência. */
const yearOf = (isoDate: string): number => Number(isoDate.slice(0, 4)) || DEFAULT_USER.birthYear;

const toUser = (profile: api.Profile): User => ({
  name: profile.name,
  birthYear: yearOf(profile.birthDate),
  sex: profile.sex,
});

/*
 A foto de perfil é LOCAL, e isso é escolha: ela existe para a pessoa se
 reconhecer no próprio app, não para identificação — e imagem de rosto não
 sobe para um servidor que nunca precisou dela. Trocar de aparelho recomeça
 sem foto, o que custa um toque.
*/
const AVATAR_PONTEIRO = 'foto-perfil.v1.json';

export const useUserStore = create<UserState>((set, get) => ({
  user: DEFAULT_USER,
  profile: null,
  loading: false,
  mood: null,
  avatarUri: null,

  setMood: (mood) => set({ mood }),
  age: () => new Date().getFullYear() - get().user.birthYear,

  load: async () => {
    if (!api.isAuthenticated()) return;
    // Primeiro o disco, na hora: é o que evita a tela sem nome (ou, antes, com
    // nome alheio) enquanto a rede não responde.
    const local = await lerPerfilLocal();
    if (local && !get().profile) set({ profile: local, user: toUser(local) });
    set({ loading: true });
    try {
      const profile = await api.fetchProfile();
      gravarPerfilLocal(profile);
      set({ profile, user: toUser(profile), loading: false });
    } catch {
      // Sem rede a tela segue com o que já tem — o perfil local, quando houver.
      set({ loading: false });
    }
  },

  clear: () => {
    gravarPerfilLocal(null);
    set({ profile: null, user: DEFAULT_USER, loading: false });
  },

  save: async (patch) => {
    set({ loading: true });
    try {
      const profile = await api.updateProfile(patch);
      gravarPerfilLocal(profile);
      set({ profile, user: toUser(profile), loading: false });
      return true;
    } catch {
      set({ loading: false });
      return false;
    }
  },

  setAvatar: async (pickedUri) => {
    try {
      // Nome com carimbo de hora: o <Image> cacheia por uri, e sobrescrever o
      // mesmo arquivo mostraria a foto antiga até o app reiniciar.
      const nome = `foto-perfil-${Date.now()}.jpg`;
      const destino = new File(Paths.document, nome);
      new File(pickedUri).copy(destino);

      const anterior = get().avatarUri;
      new File(Paths.document, AVATAR_PONTEIRO).write(JSON.stringify({ nome }));
      set({ avatarUri: destino.uri });
      if (anterior) new File(anterior).delete();
    } catch {
      // Foto que não copiou é foto que não trocou — a atual permanece.
    }
  },
}));

// Restaura a foto na subida do app, fora do fluxo de autenticação: ela é
// local e aparece na sidebar antes de o servidor responder qualquer coisa.
void (async () => {
  try {
    const ponteiro = new File(Paths.document, AVATAR_PONTEIRO);
    if (!ponteiro.exists) return;
    const { nome } = JSON.parse(await ponteiro.text()) as { nome: string };
    const foto = new File(Paths.document, nome);
    if (foto.exists) useUserStore.setState({ avatarUri: foto.uri });
  } catch {
    // Ponteiro corrompido = sem foto, nunca sem app.
  }
})();

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}
