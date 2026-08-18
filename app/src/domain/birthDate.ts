/**
 * A data de nascimento em português: `DD/MM/AAAA`, em toda tela.
 *
 * O cadastro pedia `aaaa-mm-dd` — o formato do servidor exposto a quem está
 * criando conta, com a mensagem de erro "Use o formato aaaa-mm-dd". O perfil,
 * que veio depois, já fazia certo: máscara brasileira e conversão na borda.
 * Este módulo é o que aquela tela usava, agora extraído para as duas.
 *
 * A regra é a de sempre: ISO é o formato de TRANSPORTE, e a conversão mora na
 * fronteira. Nenhuma tela mostra nem pede o formato do banco.
 */

/**
 * `1994-03-12` → `12/03/1994`. Entrada estranha volta como veio.
 *
 * Serve a QUALQUER data do app — nascimento, consentimento, início de
 * assinatura. O módulo se chama `birthDate` porque nasceu daí; a formatação
 * nunca foi específica de nascimento, e ter duas cópias com nomes diferentes
 * é como uma delas passa a mentir sobre a outra.
 */
export function formatDateBR(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** `12/03/1994` → `1994-03-12`, ou `null` se for uma data que não existe. */
export function toIsoBirthDate(brasileira: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(brasileira.trim());
  if (!m) return null;
  const [, d, mes, y] = m;
  const data = new Date(Number(y), Number(mes) - 1, Number(d));
  // 31/02 vira 03/03 no construtor do Date — comparar de volta é o que pega.
  const existe =
    data.getFullYear() === Number(y) &&
    data.getMonth() === Number(mes) - 1 &&
    data.getDate() === Number(d);
  return existe ? `${y}-${mes}-${d}` : null;
}

/** Digitou dígitos, as barras entram sozinhas — apagar também funciona. */
export function maskBirthDate(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 8);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 4) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
}

/** Idade mínima e máxima aceitas no cadastro. */
export const IDADE_MINIMA = 16;
export const IDADE_MAXIMA = 110;

/**
 * A data serve para o cadastro? Precisa existir E cair numa idade plausível —
 * a idade é entrada de todo modelo do app, e 1890 ou 2025 produziriam
 * referências que não existem.
 */
export function isValidBirthDate(brasileira: string): boolean {
  const iso = toIsoBirthDate(brasileira);
  if (!iso) return false;
  const anos = (Date.now() - new Date(`${iso}T00:00:00Z`).getTime()) / (365.25 * 24 * 3600 * 1000);
  return anos >= IDADE_MINIMA && anos <= IDADE_MAXIMA;
}
