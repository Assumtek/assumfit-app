import type { Reading } from '../../domain/types';

/**
 * A fila de sincronização é onde dado biométrico se perde em silêncio se
 * estiver errada. Ela sustenta duas garantias, e ambas são testadas aqui:
 *
 * 1. **Nada sai da fila sem confirmação.** Se o envio falha — metrô, avião,
 *    timeout — o lote continua enfileirado para a próxima janela. Remover
 *    otimisticamente perderia leitura em toda queda de rede.
 * 2. **Sem sessão, não tenta.** Enviar sem token só produziria 401 em loop.
 *
 * O que torna a garantia 1 segura é a idempotência do servidor: reenviar um
 * lote que já entrou não duplica nada, porque a chave é (usuário, instante,
 * origem). Sem isso, manter na fila causaria duplicata em vez de perda.
 */

const mockIngest = jest.fn();
const mockIsAuthenticated = jest.fn();

jest.mock('../api.service', () => ({
  ingest: (...args: unknown[]) => mockIngest(...args),
  isAuthenticated: () => mockIsAuthenticated(),
}));

// Importado depois do mock, senão o módulo real entra.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { syncQueue } = require('../sync.service') as typeof import('../sync.service');

const reading = (at: number): Reading => ({
  recordedAt: at,
  hrvMs: 70,
  heartRate: 58,
  spo2Pct: 98,
  temperatureC: 36.6,
  steps: 100,
  bpSystolic: 118,
  bpDiastolic: 76,
  stressScore: 25,
  respRate: 14,
  source: 'mock',
});

async function drain() {
  // Esvazia até a fila zerar ou o progresso parar.
  for (let i = 0; i < 10 && syncQueue.pending > 0; i++) {
    const before = syncQueue.pending;
    await syncQueue.flush();
    if (syncQueue.pending === before) break;
  }
}

beforeEach(async () => {
  mockIngest.mockReset();
  mockIsAuthenticated.mockReset().mockReturnValue(true);
  // Zera a fila entre testes — é um singleton.
  mockIngest.mockResolvedValue({ inserted: 0 });
  await drain();
  mockIngest.mockReset();
  mockIngest.mockResolvedValue({ inserted: 1 });
});

describe('fila de sincronização', () => {
  it('não envia nada sem sessão', async () => {
    mockIsAuthenticated.mockReturnValue(false);
    syncQueue.enqueue(reading(1));

    await syncQueue.flush();

    expect(mockIngest).not.toHaveBeenCalled();
    expect(syncQueue.pending).toBe(1); // continua guardado para depois do login
  });

  it('envia o lote e limpa a fila quando o servidor confirma', async () => {
    syncQueue.enqueue(reading(1));
    syncQueue.enqueue(reading(2));

    await syncQueue.flush();

    expect(mockIngest).toHaveBeenCalledTimes(1);
    expect(mockIngest.mock.calls[0][0]).toHaveLength(2);
    expect(syncQueue.pending).toBe(0);
    expect(syncQueue.error).toBeNull();
  });

  it('MANTÉM a fila quando o envio falha', async () => {
    mockIngest.mockRejectedValue(new Error('sem rede'));
    syncQueue.enqueue(reading(1));
    syncQueue.enqueue(reading(2));

    await syncQueue.flush();

    expect(syncQueue.pending).toBe(2);
    expect(syncQueue.error).toBe('sem rede');
  });

  it('reenvia o que ficou depois que a rede volta', async () => {
    mockIngest.mockRejectedValueOnce(new Error('sem rede'));
    syncQueue.enqueue(reading(1));

    await syncQueue.flush();
    expect(syncQueue.pending).toBe(1);

    mockIngest.mockResolvedValue({ inserted: 1 });
    await syncQueue.flush();

    expect(syncQueue.pending).toBe(0);
    expect(syncQueue.error).toBeNull();
  });

  it('não dispara envios concorrentes', async () => {
    let resolveIngest: (v: unknown) => void = () => undefined;
    mockIngest.mockReturnValue(new Promise((r) => (resolveIngest = r)));
    syncQueue.enqueue(reading(1));

    const first = syncQueue.flush();
    await syncQueue.flush(); // deve sair na hora, sem chamar de novo

    expect(mockIngest).toHaveBeenCalledTimes(1);
    resolveIngest({ inserted: 1 });
    await first;
  });

  it('descarta as leituras mais antigas quando estoura o teto', async () => {
    mockIsAuthenticated.mockReturnValue(false); // acumula sem enviar
    for (let i = 0; i < 2100; i++) syncQueue.enqueue(reading(i));

    expect(syncQueue.pending).toBe(2000);

    // A mais nova tem de ter sobrevivido: é ela que a tela mostra.
    mockIsAuthenticated.mockReturnValue(true);
    await syncQueue.flush();
    const enviadas = mockIngest.mock.calls[0][0] as Reading[];
    expect(enviadas[0].recordedAt).toBe(100); // as 100 primeiras foram descartadas
  });

  it('quebra em lotes do tamanho que a API aceita', async () => {
    mockIsAuthenticated.mockReturnValue(false);
    for (let i = 0; i < 600; i++) syncQueue.enqueue(reading(i));
    mockIsAuthenticated.mockReturnValue(true);

    await syncQueue.flush();

    expect((mockIngest.mock.calls[0][0] as Reading[]).length).toBe(500);
    expect(syncQueue.pending).toBe(100);
  });
});
