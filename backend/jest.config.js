/**
 * Testes do backend.
 *
 * Cobrem a lógica PURA de decisão — derivação de flags clínicas, classificação
 * de risco, materialização do plano. Não há teste de rota nem de banco aqui: o
 * que precisa de garantia é a regra que decide se alguém recebe um treino ou um
 * encaminhamento, e essa regra é função pura de propósito.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
};
