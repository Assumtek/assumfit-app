/**
 * Horário digitado à mão — "7:5", "0750", "19h30" — normalizado para `HH:MM`.
 *
 * Pedido de um testador (21/08/2026): a roda de horas anda de 15 em 15
 * minutos, e quem quer 07:50 não tinha como. Digitar é a forma manual; este
 * módulo é o que separa "o que a pessoa quis dizer" de "o que ela teclou".
 *
 * Aceita os jeitos comuns de escrever hora no Brasil — com dois-pontos, com
 * "h", só dígitos — e recusa o que não é hora: 25:00, 10:75, texto. Devolve
 * `null` para o inválido, nunca um "melhor palpite": lembrete na hora errada
 * é pior que nenhum.
 */
export function normalizarHorario(texto: string): string | null {
  const limpo = texto.trim().toLowerCase().replace(/\s+/g, '');
  if (!limpo) return null;

  let h: string;
  let m: string;
  const separado = limpo.match(/^(\d{1,2})[:h](\d{0,2})$/);
  if (separado) {
    [, h, m] = separado;
    if (m === '') m = '0';
  } else if (/^\d{3,4}$/.test(limpo)) {
    // "750" → 7:50; "0750" / "1930" → 07:50 / 19:30.
    h = limpo.slice(0, limpo.length - 2);
    m = limpo.slice(-2);
  } else if (/^\d{1,2}$/.test(limpo)) {
    // "8" → 08:00.
    h = limpo;
    m = '0';
  } else {
    return null;
  }

  const hora = Number(h);
  const minuto = Number(m);
  if (!Number.isInteger(hora) || !Number.isInteger(minuto)) return null;
  if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return null;
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}
