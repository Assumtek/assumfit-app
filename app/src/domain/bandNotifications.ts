/**
 * O filtro de avisos da pulseira — quais notificações fazem o pulso vibrar.
 *
 * Como isto funciona no iOS, porque muda tudo: a notificação NÃO passa pelo
 * nosso app. Ela vai do sistema direto para a pulseira, pelo ANCS (Apple
 * Notification Center Service), que é o que faz o aviso chegar mesmo com o app
 * fechado. Nosso papel é só configurar o filtro e ligar a bandeira de ANCS.
 *
 * E o filtro é por CATEGORIA, de um vocabulário fixo gravado no firmware —
 * telefone, SMS, WhatsApp, Instagram, Telegram… O comando não aceita
 * identificador de app em lugar nenhum (ver `QC_FILTER_APP_TYPE` no cabeçalho
 * do SDK). Consequência direta e inescapável: **o AssumFit não tem categoria
 * própria**. Ele só pode ser notificado pelo balde de "outros", e ligar esse
 * balde faz a pulseira vibrar com todo app que o firmware não reconhece.
 *
 * Isso é limitação do hardware, não escolha nossa, e a tela precisa dizer.
 */

import type { AppMark } from '../components/AppIcon';

export type CategoriaDeAviso = { type: number; enabled: boolean };

/**
 * Os três baldes de "outros" do firmware.
 *
 * São três porque o enum tem `Other1`, `Other2` e `Others`, e o cabeçalho não
 * diz qual deles recebe um app desconhecido — a documentação antiga do
 * `setFilter` numerava "15: other" numa lista de tamanho diferente da que o
 * `setAppNotiFilter` usa. Sem a pulseira na mão não dá para saber, e ligar os
 * três é a única forma de garantir que o AssumFit caia em algum.
 *
 * A sondagem existe para resolver isso: `getNotificationFilter` mostra o que o
 * firmware realmente devolve, e aí dá para reduzir a um só.
 */
export const BALDES_DE_OUTROS = [15, 16, 17];

/** Categoria de telefone e SMS — as únicas nomeadas que interessam decidir. */
export const CATEGORIA_TELEFONE = 0;
export const CATEGORIA_SMS = 1;

/**
 * O filtro que faz o AssumFit vibrar, preservando o resto.
 *
 * Recebe o filtro ATUAL lido da pulseira porque o comando de escrita substitui
 * o conjunto inteiro: mandar só o que mudou apagaria o que a pessoa já tinha
 * configurado no app do fabricante. Categoria que a pulseira não reportou não
 * é inventada aqui — se o firmware não a conhece, mandá-la é ruído no canal.
 */
export function comAssumfit(atual: CategoriaDeAviso[], ligado: boolean): CategoriaDeAviso[] {
  return atual.map((c) =>
    BALDES_DE_OUTROS.includes(c.type) ? { ...c, enabled: ligado } : c);
}

/** O AssumFit vibra hoje? Verdadeiro se qualquer balde de "outros" está ligado. */
export function assumfitVibra(atual: CategoriaDeAviso[]): boolean {
  return atual.some((c) => BALDES_DE_OUTROS.includes(c.type) && c.enabled);
}

/**
 * Quais categorias NOMEADAS estão ligadas — o que a pessoa vai sentir junto.
 *
 * A tela usa para ser honesta sobre o efeito colateral em vez de descrevê-lo em
 * abstrato: "sua pulseira também vibra com WhatsApp e Instagram" é verificável;
 * "pode vibrar com outros apps" não diz nada.
 */
export function nomeadasLigadas(atual: CategoriaDeAviso[]): string[] {
  return atual
    .filter((c) => c.enabled && !BALDES_DE_OUTROS.includes(c.type))
    .map((c) => NOME_DA_CATEGORIA[c.type])
    .filter((nome): nome is string => !!nome);
}

/**
 * O vocabulário do firmware, para a tela poder nomear o que encontrou.
 *
 * Cópia fiel de `QC_FILTER_APP_TYPE` — os saltos de numeração (7 → 10, 14 → 20)
 * são do cabeçalho, não erro de transcrição, e preenchê-los mandaria categoria
 * que o firmware não conhece.
 */
export const NOME_DA_CATEGORIA: Record<number, string> = {
  0: 'Telefone',
  1: 'SMS',
  2: 'QQ',
  3: 'WeChat',
  4: 'Facebook',
  5: 'WhatsApp',
  6: 'Twitter',
  7: 'Skype',
  10: 'Line',
  11: 'LinkedIn',
  12: 'Instagram',
  13: 'TIM',
  14: 'Snapchat',
  20: 'Messenger',
  21: 'Zalo',
  22: 'KakaoTalk',
  23: 'Telegram',
  24: 'Viber',
  25: 'Signal',
  26: 'Zoom',
  27: 'KiK',
  30: 'iMessage',
  31: 'Tinder',
  32: 'Tumblr',
  33: 'Bumble',
  34: 'Discord',
  35: 'Google Meet',
  36: 'ShareChat',
  37: 'Moj',
  40: 'TikTok',
  41: 'YouTube',
  42: 'Gmail',
};

/**
 * O ícone de cada categoria — o do app de verdade (pedido da fundadora, 22/08).
 *
 * Logotipo oficial quando o pacote o tem; para os que faltam, a cor da marca
 * com um glifo (telefone, mensagem, vídeo) ou a inicial. Toda categoria do
 * vocabulário tem marca; o teste garante. Kakao leva o glifo escuro porque o
 * logotipo é um balão marrom sobre amarelo, não branco.
 */
export const MARCA_DA_CATEGORIA: Record<number, AppMark> = {
  0: { kind: 'glyph', hex: '#34C759', icon: 'phone' },
  1: { kind: 'glyph', hex: '#34C759', icon: 'message' },
  2: { kind: 'brand', mark: 'qq' },
  3: { kind: 'brand', mark: 'wechat' },
  4: { kind: 'brand', mark: 'facebook' },
  5: { kind: 'brand', mark: 'whatsapp' },
  6: { kind: 'brand', mark: 'x' },
  7: { kind: 'glyph', hex: '#0078D4', icon: 'video' },
  10: { kind: 'brand', mark: 'line' },
  11: { kind: 'letter', hex: '#0A66C2', letter: 'in' },
  12: { kind: 'brand', mark: 'instagram' },
  13: { kind: 'letter', hex: '#004691', letter: 'T' },
  14: { kind: 'brand', mark: 'snapchat' },
  20: { kind: 'brand', mark: 'messenger' },
  21: { kind: 'brand', mark: 'zalo' },
  22: { kind: 'brand', mark: 'kakaotalk', glyphColor: '#3C1E1E' },
  23: { kind: 'brand', mark: 'telegram' },
  24: { kind: 'brand', mark: 'viber' },
  25: { kind: 'brand', mark: 'signal' },
  26: { kind: 'brand', mark: 'zoom' },
  27: { kind: 'brand', mark: 'kik' },
  30: { kind: 'brand', mark: 'imessage' },
  31: { kind: 'brand', mark: 'tinder' },
  32: { kind: 'brand', mark: 'tumblr' },
  33: { kind: 'letter', hex: '#FFC629', letter: 'b' },
  34: { kind: 'brand', mark: 'discord' },
  35: { kind: 'brand', mark: 'googlemeet' },
  36: { kind: 'letter', hex: '#D63B36', letter: 'S' },
  37: { kind: 'letter', hex: '#1A1A1A', letter: 'M' },
  40: { kind: 'brand', mark: 'tiktok' },
  41: { kind: 'brand', mark: 'youtube' },
  42: { kind: 'brand', mark: 'gmail' },
};

/** O balde de "outros apps": cinza neutro com a grade de apps. */
export const MARCA_DE_OUTROS: AppMark = { kind: 'glyph', hex: '#8E8E93', icon: 'grid' };

/** Uma linha da tela: categoria nomeada, ou o balde único de "outros apps". */
export type LinhaDeAviso = {
  /** `cat:<type>` para as nomeadas; `outros` para o balde. Chave de lista. */
  key: string;
  nome: string;
  marca: AppMark;
  enabled: boolean;
  /** Verdadeiro na linha que agrupa os baldes — é onde o AssumFit mora. */
  outros: boolean;
};

/**
 * O filtro traduzido para a tela, uma linha por escolha que a pessoa pode fazer.
 *
 * Um testador pediu (21/08) para escolher COM O QUÊ a pulseira vibra — só o
 * AssumFit, ou tudo do celular. A metade "só o AssumFit" o hardware não oferece
 * (ver cabeçalho), mas a outra metade sim, categoria a categoria, e é isto.
 *
 * Três regras: a ordem é a do firmware, porque é a que o app do fabricante
 * também mostra; categoria que a pulseira reportou mas o vocabulário não nomeia
 * fica de fora, já que um interruptor chamado "31" não é escolha; e os três
 * baldes de "outros" viram UMA linha, porque a pessoa não tem como distinguir
 * o que cai em cada um — nem nós.
 */
export function linhasParaTela(atual: CategoriaDeAviso[]): LinhaDeAviso[] {
  const nomeadas = atual
    .filter((c) => !BALDES_DE_OUTROS.includes(c.type) && NOME_DA_CATEGORIA[c.type])
    .map((c) => ({
      key: `cat:${c.type}`,
      nome: NOME_DA_CATEGORIA[c.type],
      marca: MARCA_DA_CATEGORIA[c.type],
      enabled: c.enabled,
      outros: false,
    }));
  const temBalde = atual.some((c) => BALDES_DE_OUTROS.includes(c.type));
  return temBalde
    ? [...nomeadas, { key: 'outros', nome: 'Outros apps', marca: MARCA_DE_OUTROS, enabled: assumfitVibra(atual), outros: true }]
    : nomeadas;
}

/** Liga ou desliga UMA categoria nomeada, preservando o resto do conjunto. */
export function comCategoria(atual: CategoriaDeAviso[], type: number, ligado: boolean): CategoriaDeAviso[] {
  return atual.map((c) => (c.type === type ? { ...c, enabled: ligado } : c));
}

/** Tudo ligado ou tudo desligado — o atalho "todas as notificações do celular". */
export function comTodas(atual: CategoriaDeAviso[], ligado: boolean): CategoriaDeAviso[] {
  return atual.map((c) => ({ ...c, enabled: ligado }));
}

/** Verdadeiro se toda linha da tela está ligada — o estado do interruptor-mestre. */
export function todasLigadas(atual: CategoriaDeAviso[]): boolean {
  const linhas = linhasParaTela(atual);
  return linhas.length > 0 && linhas.every((l) => l.enabled);
}
