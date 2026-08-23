import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { create } from 'zustand';

/**
 * Fotos de EVOLUÇÃO — a linha do tempo do corpo, para comparar.
 *
 * Pedido de um testador (ago/2026): "subir foto pra comparar evolução". Locais,
 * como a foto de perfil, e pela mesma razão: imagem de corpo não sobe para um
 * servidor que nunca precisou dela. Trocar de aparelho recomeça sem fotos —
 * é o preço de a foto ficar só com quem ela mostra.
 *
 * Cada foto entra redimensionada (1080 de largura): é o que a comparação
 * lado a lado usa, e o original de 12 MP só custaria disco e memória.
 */
/** O ângulo da foto: frente, lado ou costas. Fotos antigas não têm. */
export type AnguloDaFoto = 'frente' | 'lado' | 'costas';
export const ANGULOS: { key: AnguloDaFoto; label: string }[] = [
  { key: 'frente', label: 'Frente' },
  { key: 'lado', label: 'Lado' },
  { key: 'costas', label: 'Costas' },
];
export type FotoDeEvolucao = { nome: string; em: string; uri: string; angulo?: AnguloDaFoto };

const PONTEIRO = 'fotos-evolucao.v1.json';

type State = {
  fotos: FotoDeEvolucao[];
  carregada: boolean;
  carregar: () => Promise<void>;
  /** Várias de uma vez: a mesma avaliação tem frente, lado e costas (pedido de testador, 22/08). */
  adicionar: (pickedUri: string, width?: number, angulo?: AnguloDaFoto) => Promise<void>;
  remover: (nome: string) => void;
};

function gravar(fotos: FotoDeEvolucao[]) {
  try {
    new File(Paths.document, PONTEIRO).write(JSON.stringify(fotos.map(({ nome, em, angulo }) => ({ nome, em, angulo }))));
  } catch {
    // Perder o índice não pode derrubar a tela — a próxima carga recomeça vazia.
  }
}

export const useProgressPhotosStore = create<State>((set, get) => ({
  fotos: [],
  carregada: false,

  carregar: async () => {
    if (get().carregada) return;
    try {
      const p = new File(Paths.document, PONTEIRO);
      if (p.exists) {
        const lista = JSON.parse(await p.text()) as { nome: string; em: string; angulo?: AnguloDaFoto }[];
        const fotos = lista
          .map((f) => ({ ...f, uri: new File(Paths.document, f.nome).uri }))
          .filter((f) => new File(Paths.document, f.nome).exists);
        set({ fotos });
      }
    } catch {
      // Índice corrompido = sem fotos, nunca sem tela.
    }
    set({ carregada: true });
  },

  adicionar: async (pickedUri, width, angulo) => {
    try {
      let origem = pickedUri;
      if ((width ?? 0) > 1080) {
        const r = await ImageManipulator.manipulate(pickedUri).resize({ width: 1080 }).renderAsync();
        origem = (await r.saveAsync({ compress: 0.85, format: SaveFormat.JPEG })).uri;
      }
      const nome = `evolucao-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jpg`;
      new File(origem).copy(new File(Paths.document, nome));
      const fotos = [...get().fotos, { nome, em: new Date().toISOString(), uri: new File(Paths.document, nome).uri, ...(angulo ? { angulo } : {}) }];
      gravar(fotos);
      set({ fotos });
    } catch {
      // Foto que não copiou é foto que não entrou.
    }
  },

  remover: (nome) => {
    const fotos = get().fotos.filter((f) => f.nome !== nome);
    try {
      new File(Paths.document, nome).delete();
    } catch {
      // Arquivo já fora do disco: o índice é o que importa.
    }
    gravar(fotos);
    set({ fotos });
  },
}));
