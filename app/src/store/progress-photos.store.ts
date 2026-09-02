import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { create } from 'zustand';

import {
  addProgressPhoto,
  deleteProgressPhoto,
  fetchProgressPhotos,
} from '../services/api.service';
import { subirImagem } from '../services/foto';

/**
 * Fotos de EVOLUÇÃO, a linha do tempo do corpo, para comparar.
 *
 * Pedido de um testador (ago/2026): "subir foto pra comparar evolução". Elas
 * nasceram LOCAIS, com um índice em arquivo, pelo princípio de que imagem de
 * corpo não sobe para um servidor que nunca precisou dela, e o preço declarado
 * era trocar de aparelho e recomeçar sem fotos.
 *
 * Desde 01/09/2026 elas vão para o S3 (decisão da fundadora, "todas as imagens
 * precisam ser salvas na S3"), o que resolve exatamente esse preço: a linha do
 * tempo do corpo é o conteúdo que MAIS dói perder, porque não dá para refazer
 * uma foto de três meses atrás.
 *
 * O que isso exigiu, e não é opcional: consentimento próprio (`progress_photos`),
 * bucket privado com URL assinada de vida curta, e exclusão que apaga o objeto
 * junto da linha.
 *
 * As fotos que já estavam no aparelho continuam aparecendo, das duas fontes ao
 * mesmo tempo: elas não têm chave no servidor, e apagá-las na migração seria
 * destruir justamente o histórico que o recurso existe para guardar.
 */

/** O ângulo da foto: frente, lado ou costas. Fotos antigas não têm. */
export type AnguloDaFoto = 'frente' | 'lado' | 'costas';
export const ANGULOS: { key: AnguloDaFoto; label: string }[] = [
  { key: 'frente', label: 'Frente' },
  { key: 'lado', label: 'Lado' },
  { key: 'costas', label: 'Costas' },
];

export type FotoDeEvolucao = {
  /** Identidade local (nome do arquivo) ou do servidor (id da linha). */
  nome: string;
  em: string;
  uri: string;
  angulo?: AnguloDaFoto;
  /** `true` quando a foto vive só neste aparelho, de antes da mudança. */
  local?: boolean;
};

const PONTEIRO = 'fotos-evolucao.v1.json';

type State = {
  fotos: FotoDeEvolucao[];
  carregada: boolean;
  carregar: () => Promise<void>;
  /** Várias de uma vez: a mesma avaliação tem frente, lado e costas (pedido de testador, 22/08). */
  adicionar: (pickedUri: string, width?: number, angulo?: AnguloDaFoto) => Promise<void>;
  remover: (nome: string) => void;
  /**
   * Tira da tela as fotos que viviam na conta, depois de a pessoa revogar.
   *
   * As locais FICAM: elas nunca saíram deste aparelho, e revogar o
   * consentimento de guardar na nuvem não é pedido para apagá-las.
   */
  esquecerAsDaConta: () => void;
};

/** As que ficaram no aparelho, de antes do S3. Só leitura: nada novo entra aqui. */
function lerLocais(): FotoDeEvolucao[] {
  try {
    const p = new File(Paths.document, PONTEIRO);
    if (!p.exists) return [];
    const lista = JSON.parse(p.textSync()) as {
      nome: string;
      em: string;
      angulo?: AnguloDaFoto;
    }[];
    return lista
      .filter((f) => new File(Paths.document, f.nome).exists)
      .map((f) => ({ ...f, uri: new File(Paths.document, f.nome).uri, local: true }));
  } catch {
    // Índice corrompido = sem fotos locais, nunca sem tela.
    return [];
  }
}

function gravarLocais(fotos: FotoDeEvolucao[]) {
  try {
    new File(Paths.document, PONTEIRO).write(
      JSON.stringify(
        fotos
          .filter((f) => f.local)
          .map(({ nome, em, angulo }) => ({ nome, em, angulo })),
      ),
    );
  } catch {
    // Perder o índice não pode derrubar a tela.
  }
}

export const useProgressPhotosStore = create<State>((set, get) => ({
  fotos: [],
  carregada: false,

  carregar: async () => {
    if (get().carregada) return;
    const locais = lerLocais();
    let remotas: FotoDeEvolucao[] = [];
    try {
      remotas = (await fetchProgressPhotos())
        .filter((f) => f.url)
        .map((f) => ({
          nome: f.id,
          em: f.takenAt,
          uri: f.url as string,
          ...(f.angle ? { angulo: f.angle } : {}),
        }));
    } catch {
      // Sem rede, a tela mostra o que existe neste aparelho em vez de nada.
    }
    // Mais recentes primeiro, misturando as duas origens: para quem olha, é
    // uma linha do tempo só.
    const fotos = [...locais, ...remotas].sort((a, b) => a.em.localeCompare(b.em));
    set({ fotos, carregada: true });
  },

  adicionar: async (pickedUri, width, angulo) => {
    try {
      let origem = pickedUri;
      if ((width ?? 0) > 1080) {
        const r = await ImageManipulator.manipulate(pickedUri).resize({ width: 1080 }).renderAsync();
        origem = (await r.saveAsync({ compress: 0.85, format: SaveFormat.JPEG })).uri;
      }

      const chave = await subirImagem(origem, 'evolucao');
      if (!chave) return;
      const criada = await addProgressPhoto({
        imageKey: chave,
        ...(angulo ? { angle: angulo } : {}),
      });
      if (!criada.url) return;

      set({
        fotos: [
          ...get().fotos,
          {
            nome: criada.id,
            em: criada.takenAt,
            uri: criada.url,
            ...(angulo ? { angulo } : {}),
          },
        ],
      });
    } catch {
      // Foto que não subiu é foto que não entrou. A tela não mente dizendo que
      // guardou: no próximo carregamento ela não estará lá.
    }
  },

  remover: (nome) => {
    const alvo = get().fotos.find((f) => f.nome === nome);
    const fotos = get().fotos.filter((f) => f.nome !== nome);
    set({ fotos });

    if (alvo?.local) {
      try {
        new File(Paths.document, nome).delete();
      } catch {
        // Arquivo já fora do disco: o índice é o que importa.
      }
      gravarLocais(fotos);
      return;
    }
    // Remota: o servidor apaga a linha E o objeto no bucket.
    void deleteProgressPhoto(nome).catch(() => undefined);
  },

  esquecerAsDaConta: () => set({ fotos: get().fotos.filter((f) => f.local) }),
}));
