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
    BALDES_DE_OUTROS.includes(c.type) ? { ...c, enabled: ligado } : c,
  );
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
