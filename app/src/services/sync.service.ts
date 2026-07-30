import { File, Paths } from 'expo-file-system';

import type { Reading } from '../domain/types';
import { ingest, isAuthenticated } from './api.service';

/** A cada quantos milissegundos tentar esvaziar a fila. */
const FLUSH_INTERVAL_MS = 30_000;
/** Teto da fila. Acima disso, descartamos as MAIS ANTIGAS. */
const MAX_QUEUE = 2000;
/** Tamanho máximo por requisição — o mesmo limite que a API valida. */
const BATCH_SIZE = 500;

/**
 * Fila de envio das leituras.
 *
 * O wearable lê o tempo todo, inclusive sem rede: metrô, avião, celular no
 * bolso com dados desligados. Enviar leitura a leitura perderia tudo que
 * acontece offline. Então acumula em memória e esvazia em lote.
 *
 * O envio é seguro contra repetição porque o ingest é idempotente pela chave
 * (usuário, instante, origem) — reenviar um lote que já entrou não duplica
 * nada. É isso que permite manter o item na fila até ter confirmação, em vez
 * de removê-lo otimisticamente e perder dado num timeout.
 *
 * Quando estourar o teto, descartamos o mais antigo: leitura de uma hora atrás
 * é histórico, a dos últimos minutos é o que a tela mostra.
 */
/**
 * Onde a fila sobrevive ao app fechado.
 *
 * "Acumula em memória" resolvia o offline mas não o encerramento: leitura feita
 * no metrô e app fechado antes de voltar o sinal desaparecia, e o motivo era
 * invisível — nada falhava, o dado só nunca chegava.
 */
const ARQUIVO_FILA = 'sync-queue.v1.json';

function arquivo(): File {
  return new File(Paths.document, ARQUIVO_FILA);
}

class SyncQueue {
  private queue: Reading[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  /** Só grava depois de ter lido o que já estava salvo. Ver `persist`. */
  private restored = false;

  /**
   * Avisado quando um lote é CONFIRMADO pelo servidor.
   *
   * Existe por causa de uma inconsistência visível na tela inicial: o score vem
   * do modelo, calculado sobre a última leitura que o servidor recebeu, e os
   * blocos de métrica vêm da leitura ao vivo do aparelho. Entre uma sincronização
   * e a seguinte os dois divergem — a tela mostrava "Recuperação: 85 ms" ao lado
   * de um score calculado sobre uma leitura mais antiga. Confirmado o lote, o
   * insight é invalidado e volta coerente.
   *
   * Um callback, e não um import da store: o serviço de sincronização não deve
   * conhecer a interface, ou o ciclo de dependência aparece na primeira store
   * que precisar sincronizar algo.
   */
  onSynced: (() => void) | null = null;
  private lastError: string | null = null;

  /** Recarrega o que ficou por enviar de uma sessão anterior. */
  async restore(): Promise<void> {
    try {
      const f = arquivo();
      if (!f.exists) return;
      const guardadas = JSON.parse(await f.text()) as Reading[];
      // Na frente das novas: são mais antigas, e o ingest é idempotente pela
      // chave (usuário, instante, origem) — reenviar não duplica.
      this.queue = [...guardadas, ...this.queue].slice(-MAX_QUEUE);
    } catch {
      // Fila ilegível não pode impedir o app de coletar dado novo.
    } finally {
      this.restored = true;
      this.persist();
    }
  }

  /**
   * Arquivo, e não chaveiro.
   *
   * A fila chega a 2000 leituras; o `SecureStore` é feito para segredo pequeno e
   * desaconselha passar de 2 KB. O diretório do app é sandbox e o iOS o cifra em
   * repouso quando o aparelho tem senha, que é a proteção adequada para série
   * biométrica — o chaveiro continua sendo o lugar dos tokens.
   */
  private persist(): void {
    /*
     Nada de gravar antes de ler.

     A leitura do arquivo é assíncrona, e uma leitura da pulseira pode chegar no
     meio dela. Gravar aí sobrescreveria o arquivo com a fila em memória — que
     ainda não tem o que estava salvo —, apagando justamente o que a restauração
     ia buscar.
     */
    if (!this.restored) return;
    try {
      arquivo().write(JSON.stringify(this.queue));
    } catch {
      // Disco cheio ou permissão negada não podem derrubar a coleta.
    }
  }

  enqueue(reading: Reading) {
    this.queue.push(reading);
    if (this.queue.length > MAX_QUEUE) {
      this.queue = this.queue.slice(-MAX_QUEUE);
    }
    this.persist();
  }

  start() {
    if (this.timer) return;
    void this.restore();
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get pending() {
    return this.queue.length;
  }

  get error() {
    return this.lastError;
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0 || !isAuthenticated()) return;
    this.flushing = true;

    try {
      const batch = this.queue.slice(0, BATCH_SIZE);
      await ingest(batch);
      // Só remove depois da confirmação. Se o app cair no meio, o lote é
      // reenviado e a idempotência do servidor cuida do resto.
      this.queue = this.queue.slice(batch.length);
      // Grava a fila menor: sem isso, um app fechado logo após o envio
      // ressuscitaria o lote já confirmado na próxima abertura.
      this.persist();
      this.lastError = null;
      this.onSynced?.();
    } catch (err) {
      // Falha de rede mantém a fila intacta para a próxima janela.
      this.lastError = err instanceof Error ? err.message : 'falha ao sincronizar';
    } finally {
      this.flushing = false;
    }
  }
}

export const syncQueue = new SyncQueue();
