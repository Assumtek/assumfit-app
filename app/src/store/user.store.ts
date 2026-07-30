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
  save: (patch: api.ProfilePatch) => Promise<boolean>;
  setAvatar: (pickedUri: string) => Promise<void>;
};

/**
 * Perfil de demonstração.
 *
 * Continua existindo depois da autenticação porque as telas de métrica precisam
 * de idade e sexo para escolher a faixa de referência CERTA — sem eles, a idade
 * biológica compara contra a população errada. Enquanto o servidor não responde,
 * é melhor calcular com um perfil declaradamente fictício do que não desenhar
 * tela nenhuma; assim que `/auth/me` volta, ele é substituído.
 */
const DEFAULT_USER: User = {
  name: 'Rafael',
  birthYear: 1994,
  sex: 'm',
};

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
    set({ loading: true });
    try {
      const profile = await api.fetchProfile();
      set({ profile, user: toUser(profile), loading: false });
    } catch {
      // Sem rede a tela segue com o que já tem. Perfil não é dado crítico de
      // funcionamento — o que quebraria o app é ficar sem idade e sexo, e o
      // padrão cobre isso.
      set({ loading: false });
    }
  },

  save: async (patch) => {
    set({ loading: true });
    try {
      const profile = await api.updateProfile(patch);
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
