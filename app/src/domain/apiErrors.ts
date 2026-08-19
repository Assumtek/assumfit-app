/**
 * O que dizer quando uma chamada à API falha.
 *
 * Havia oito telas com a mesma frase escrita à mão — "Confira a conexão e tente
 * de novo" — no `catch`, sem olhar o erro. E a causa mais comum não era conexão
 * nenhuma: era a SESSÃO. Em produção (ago/2026), cinco tentativas de analisar
 * uma refeição falharam com 401 e a tela mandou conferir o Wi-Fi. Duas horas
 * depois o mesmo endpoint respondeu em 8,7 segundos, sem ninguém ter mexido em
 * rede.
 *
 * Mensagem de erro que aponta a causa errada é pior que mensagem genérica: ela
 * manda a pessoa consertar o que não está quebrado, e esconde o que está.
 */

/** O que o axios devolve num erro, sem depender do tipo dele aqui. */
type ErroDeApi = {
  response?: { status?: number };
  code?: string;
  message?: string;
  isAxiosError?: boolean;
};

export type CausaDaFalha = 'sessao' | 'permissao' | 'servidor' | 'tempo' | 'conexao' | 'desconhecida';

export function causaDaFalha(err: unknown): CausaDaFalha {
  const e = err as ErroDeApi | undefined;
  const status = e?.response?.status;

  if (status === 401) return 'sessao';
  if (status === 403) return 'permissao';
  if (typeof status === 'number' && status >= 500) return 'servidor';
  if (e?.code === 'ECONNABORTED') return 'tempo';
  /*
   Sem resposta E com marca de axios: aí sim o pedido não chegou.

   A checagem exige `code` ou `isAxiosError` de propósito. Um `Error` comum
   lançado em qualquer ponto do nosso código também não tem `response`, e
   classificá-lo como falha de rede recriaria o defeito que esta função existe
   para corrigir — só que num lugar mais difícil de notar.
  */
  if (e?.response === undefined && (e?.code || e?.isAxiosError)) return 'conexao';
  return 'desconhecida';
}

/**
 * A frase para a tela, com a AÇÃO que resolve cada causa.
 *
 * `oQueFalhou` entra no começo em linguagem da tela ("A análise", "A edição") —
 * é o que faz a mesma função servir a oito lugares sem virar texto genérico.
 */
export function mensagemDaFalha(err: unknown, oQueFalhou: string): string {
  switch (causaDaFalha(err)) {
    case 'sessao':
      return `${oQueFalhou} falhou porque sua sessão expirou. Entre novamente para continuar.`;
    case 'permissao':
      return `${oQueFalhou} não foi autorizada. Verifique se o consentimento segue ativo em Configurações.`;
    case 'servidor':
      return `${oQueFalhou} falhou no servidor. Não é problema seu — tente de novo em alguns minutos.`;
    case 'tempo':
      return `${oQueFalhou} demorou demais e foi interrompida. Tente de novo.`;
    case 'conexao':
      return `${oQueFalhou} não chegou ao servidor. Confira a conexão e tente de novo.`;
    default:
      return `${oQueFalhou} falhou. Tente de novo em instantes.`;
  }
}
