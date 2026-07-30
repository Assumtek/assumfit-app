/**
 * Tokens que NÃO dependem do tema.
 *
 * Espaçamento, raio e espessura de fio são geometria, não cor — trocar entre
 * claro e escuro não mexe em nenhum deles. Ficam separados da paleta justamente
 * para deixar isso explícito: o que muda com o tema está em `palette.ts`, o que
 * nunca muda está aqui.
 */
export { radius, space } from './palette';

export const hairlineWidth = 1;
