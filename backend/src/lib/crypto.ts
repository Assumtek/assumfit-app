import crypto from 'node:crypto';

import { env } from './env';

/**
 * Cifra simétrica para credencial de terceiros.
 *
 * Token de calendário não é dado nosso — é uma chave que abre a conta Google ou
 * Microsoft da pessoa. Um vazamento do banco com esses tokens em claro dá ao
 * atacante a agenda de todos os assinantes, e nem apagar a conta aqui fecha a
 * porta: só a revogação no provedor fecha. É a diferença entre expor dado e
 * entregar credencial, e por isso vale a camada extra.
 *
 * AES-256-GCM, não CBC: GCM é autenticado, então adulterar o texto cifrado
 * falha na verificação em vez de decifrar em lixo silencioso.
 *
 * O que isto NÃO protege: quem tiver o processo tem a chave. A proteção é
 * contra dump de banco, réplica de leitura e backup — que são justamente os
 * caminhos por onde dado costuma escapar.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function key(): Buffer {
  if (!env.CALENDAR_ENCRYPTION_KEY) {
    throw new Error('CALENDAR_ENCRYPTION_KEY ausente: integração de calendário indisponível');
  }
  return Buffer.from(env.CALENDAR_ENCRYPTION_KEY, 'hex');
}

/**
 * Devolve `iv.tag.texto`, tudo em base64url.
 *
 * O IV é aleatório por chamada e viaja junto: reaproveitar IV em GCM quebra a
 * cifra por completo, e guardá-lo em outra coluna só criaria a chance de os
 * dois se separarem.
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decrypt(payload: string): string {
  const [ivPart, tagPart, dataPart] = payload.split('.');
  if (!ivPart || !tagPart || !dataPart) throw new Error('texto cifrado malformado');

  const decipher = crypto.createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString('utf8');
}
