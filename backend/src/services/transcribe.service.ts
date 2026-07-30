import {
  GetTranscriptionJobCommand,
  StartTranscriptionJobCommand,
  TranscribeClient,
} from '@aws-sdk/client-transcribe';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Transcrição de áudio pt-BR — o desenho do MUVX (GDT-458), enxugado.
 *
 * O áudio sobe DIRETO do aparelho para o S3 por URL pré-assinada: passar o
 * arquivo pelo nosso servidor só para repassá-lo dobraria o tráfego sem ganhar
 * nada. O job do Transcribe é assíncrono; o app faz o polling do resultado.
 *
 * O áudio é EFÊMERO por regra de ciclo de vida do bucket (1 dia): voz é dado
 * pessoal, e a transcrição — que é o que o produto quer — vira texto na
 * conversa, com o mesmo tratamento do texto digitado.
 */

const REGION = process.env.AWS_REGION ?? 'sa-east-1';
const BUCKET = process.env.AUDIO_BUCKET ?? 'assumfit-audio';

const s3 = new S3Client({ region: REGION });
const transcribe = new TranscribeClient({ region: REGION });

export const configured = Boolean(process.env.AWS_ACCESS_KEY_ID);

const FORMATS = new Set(['m4a', 'mp3', 'wav', 'mp4', 'ogg', 'webm', 'flac', 'amr']);

export async function presignAudioUpload(userId: string, format: string) {
  if (!FORMATS.has(format)) throw new Error(`formato não suportado: ${format}`);
  const key = `audio/${userId}/${Date.now()}.${format}`;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: `audio/${format}` }),
    { expiresIn: 300 },
  );
  return { uploadUrl: url, key };
}

export async function startTranscription(userId: string, key: string, format: string) {
  if (!key.startsWith(`audio/${userId}/`)) throw new Error('chave de áudio de outra conta');
  if (!FORMATS.has(format)) throw new Error(`formato não suportado: ${format}`);

  // Nome idempotente por chave: repetir o start do mesmo áudio não cria job novo.
  const jobName = `assumfit-${key.replaceAll('/', '-').replaceAll('.', '-')}`;
  await transcribe
    .send(
      new StartTranscriptionJobCommand({
        TranscriptionJobName: jobName,
        LanguageCode: 'pt-BR',
        MediaFormat: format as never,
        Media: { MediaFileUri: `s3://${BUCKET}/${key}` },
      }),
    )
    .catch((err: Error) => {
      // Job já existente (retry do app) não é erro — o polling resolve.
      if (!String(err.name).includes('Conflict')) throw err;
    });
  return { jobName };
}

export async function getTranscription(jobName: string): Promise<{
  status: 'TRANSCRIBING' | 'DONE' | 'FAILED';
  transcript?: string;
}> {
  const { TranscriptionJob: job } = await transcribe.send(
    new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }),
  );
  const status = job?.TranscriptionJobStatus;
  if (status === 'COMPLETED') {
    const uri = job?.Transcript?.TranscriptFileUri;
    if (!uri) return { status: 'FAILED' };
    const res = await fetch(uri);
    const data = (await res.json()) as { results?: { transcripts?: { transcript?: string }[] } };
    const texto = data.results?.transcripts?.map((t) => t.transcript ?? '').join(' ') ?? '';
    return { status: 'DONE', transcript: texto.trim() };
  }
  if (status === 'FAILED') return { status: 'FAILED' };
  return { status: 'TRANSCRIBING' };
}
