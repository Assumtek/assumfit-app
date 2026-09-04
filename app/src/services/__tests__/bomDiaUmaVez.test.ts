import { valeRedigirOBomDia, registrarBomDiaArmado } from '../notifications.service';

/**
 * O bom dia é redigido uma vez por manhã.
 *
 * O clima se atualiza a cada 15 minutos e rearmava a notificação em cada um
 * deles, comprando um texto do modelo por refresh. A previsão continua fresca
 * onde importa: mudança de três graus vale um texto novo, porque é onde a
 * frase troca de sentido.
 */
const mockArquivos = new Map<string, string>();

jest.mock('expo-file-system', () => ({
  Paths: { document: '/doc' },
  File: class {
    caminho: string;
    constructor(_dir: unknown, nome?: string) {
      this.caminho = nome ?? String(_dir);
    }
    get exists() {
      return mockArquivos.has(this.caminho);
    }
    textSync() {
      return mockArquivos.get(this.caminho) ?? '';
    }
    write(conteudo: string) {
      mockArquivos.set(this.caminho, conteudo);
    }
  },
}));

describe('bom dia, uma vez por manhã', () => {
  beforeEach(() => mockArquivos.clear());

  it('redige quando não há nada armado', async () => {
    expect(await valeRedigirOBomDia(22)).toBe(true);
  });

  it('não redige de novo no mesmo dia com previsão parecida', async () => {
    registrarBomDiaArmado(22);
    expect(await valeRedigirOBomDia(22)).toBe(false);
    expect(await valeRedigirOBomDia(24)).toBe(false);
  });

  it('redige de novo quando a previsão muda o sentido da frase', async () => {
    registrarBomDiaArmado(28);
    // "bom dia com 28 graus" tocando numa manhã de 12 é pior que não ter.
    expect(await valeRedigirOBomDia(12)).toBe(true);
  });

  it('na dúvida, redige: índice corrompido não pode custar a manhã', async () => {
    mockArquivos.set('bom-dia-armado.v1.json', 'isto não é json');
    expect(await valeRedigirOBomDia(22)).toBe(true);
  });
});
