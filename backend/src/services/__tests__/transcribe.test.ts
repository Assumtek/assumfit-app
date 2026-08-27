import { formatoParaOServico } from '../transcribe.service';

/**
 * O formato do arquivo e o formato declarado ao serviço não são a mesma coisa.
 *
 * O AWS Transcribe não conhece `m4a`, e é justamente o que o iPhone grava. O
 * ditado por voz falhava sempre, em todo iPhone, e a mensagem do app estava
 * certa sobre o sintoma: "o áudio chegou num formato que o serviço não leu".
 */
describe('formato declarado ao serviço de transcrição', () => {
  it('m4a é declarado como mp4, que é o contêiner de verdade', () => {
    expect(formatoParaOServico('m4a')).toBe('mp4');
  });

  it('os formatos que o serviço já conhece passam intactos', () => {
    for (const f of ['mp3', 'wav', 'mp4', 'ogg', 'webm', 'flac', 'amr']) {
      expect(formatoParaOServico(f)).toBe(f);
    }
  });
});
