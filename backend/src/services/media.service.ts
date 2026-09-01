import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * As imagens do app, no S3.
 *
 * Decisão da fundadora (01/09/2026): "todas as imagens precisam ser salvas na
 * S3". Antes cada foto ficava no APARELHO (refeição, evolução, perfil, e a do
 * chat que acabara de nascer), o que as perdia na troca de celular.
 *
 * O desenho é o mesmo do áudio, e pelo mesmo motivo: a imagem sobe DIRETO do
 * aparelho para o S3 por URL pré-assinada, sem passar pelo nosso servidor, o
 * que dobraria o tráfego sem ganhar nada. A leitura também é por URL assinada,
 * de vida curta: o bucket é privado, sem acesso público em nenhuma forma.
 *
 * O que muda em relação ao áudio é a RETENÇÃO. Áudio é efêmero (um dia, e o
 * que o produto queria era a transcrição); imagem é o conteúdo em si, e some
 * quando a pessoa apaga o registro dela ou a conta inteira.
 *
 * **Dado pessoal, e parte dele sensível.** Foto de corpo (evolução) e foto de
 * prato descrevem saúde. A chave inclui o dono, e toda leitura confere o dono
 * antes de assinar: sem isso, quem descobrisse uma chave leria a foto de
 * qualquer pessoa.
 */

const REGION = process.env.AWS_REGION ?? 'sa-east-1';
const BUCKET = process.env.IMAGE_BUCKET ?? 'assumfit-images';

const s3 = new S3Client({ region: REGION });

export const configured = Boolean(process.env.AWS_ACCESS_KEY_ID);

/**
 * Para que serve a imagem. Vira pasta na chave, o que torna possível apagar um
 * escopo inteiro (todas as fotos de evolução, por exemplo) sem tocar no resto.
 */
export const ESCOPOS = ['chat', 'refeicao', 'evolucao', 'perfil'] as const;
export type EscopoDeImagem = (typeof ESCOPOS)[number];

/** Só JPEG e PNG: é o que o app produz, e a lista curta evita surpresa. */
const TIPOS: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png' };

/**
 * A forma de uma chave nossa, para validar o que volta do aparelho.
 *
 * A chave viaja até o app e volta em pedidos de leitura e de exclusão. Sem
 * esta trava, um valor forjado poderia apontar para outro prefixo do bucket.
 */
export const FORMATO_DA_CHAVE =
  /^img\/[0-9a-f-]{36}\/(chat|refeicao|evolucao|perfil)\/[a-z0-9-]{1,64}\.(jpg|png)$/;

export function chaveEhDoUsuario(key: string, userId: string): boolean {
  return FORMATO_DA_CHAVE.test(key) && key.startsWith(`img/${userId}/`);
}

/** URL para o aparelho SUBIR a imagem, válida por cinco minutos. */
export async function presignImageUpload(
  userId: string,
  escopo: EscopoDeImagem,
  ext: 'jpg' | 'png' = 'jpg'): Promise<{ uploadUrl: string; key: string; contentType: string }> {
  if (!ESCOPOS.includes(escopo)) throw new Error(`escopo desconhecido: ${escopo}`);
  const contentType = TIPOS[ext];
  if (!contentType) throw new Error(`extensão não suportada: ${ext}`);

  const nome = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const key = `img/${userId}/${escopo}/${nome}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
  return { uploadUrl, key, contentType };
}

/**
 * URL para o aparelho LER a imagem.
 *
 * Uma hora de validade: o suficiente para a tela montar e rolar, e curto o
 * bastante para uma URL vazada não virar acesso permanente. O app pede de novo
 * quando precisa, o que é barato.
 */
export async function presignImageRead(userId: string, key: string): Promise<string> {
  if (!chaveEhDoUsuario(key, userId)) throw new Error('imagem de outra conta');
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 3600 });
}

/**
 * Apaga imagens. Usado quando a pessoa remove um registro e quando a conta é
 * excluída: LGPD Art. 18, e não adianta apagar a linha do banco e deixar a
 * foto no bucket.
 */
export async function apagarImagens(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  // O S3 aceita mil por chamada; as nossas contas não chegam perto, mas a
  // exclusão de conta de quem usa há anos pode.
  for (let i = 0; i < keys.length; i += 1000) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
      }),
    );
  }
}

/** Todas as imagens de uma conta, para a exclusão apagar o que existe de fato. */
export async function listarImagensDaConta(userId: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const r = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: `img/${userId}/`,
        ContinuationToken: token,
      }),
    );
    for (const o of r.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = r.NextContinuationToken;
  } while (token);
  return keys;
}
