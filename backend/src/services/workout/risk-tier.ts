import { RiskTier } from '@prisma/client';

/**
 * Classificação de risco clínico a partir das flags da anamnese.
 *
 * A diferença que define este arquivo, em relação ao sistema de onde a tabela
 * veio: lá o TIER_3 (cardiopata, gestante) ia para uma fila de validação
 * HUMANA, revisada por um profissional antes de chegar à pessoa. Aqui não
 * existe esse profissional. O plano gerado vai direto para quem vai executá-lo,
 * sozinho, lendo a instrução na tela.
 *
 * Então TIER_3 encaminha, igual ao TIER_4. Não é conservadorismo: é o que
 * mantém o produto do lado certo da fronteira de "não é dispositivo médico".
 */

/**
 * Flag → tier mínimo. É a calibração v1, e o único ponto a ajustar quando os
 * limiares clínicos forem fechados. O tier final é o MAIOR entre as flags
 * presentes; sem flag clínica, TIER_0.
 */
const FLAG_MIN_TIER: Record<string, RiskTier> = {
  // TIER_4 — contraindicação absoluta (PAR-Q): exige liberação médica antes de
  // qualquer exercício.
  'dor-toracica-nao-investigada': RiskTier.TIER_4,
  // TIER_3 — risco que, no desenho original, exigia supervisão humana. Aqui,
  // encaminhamento.
  cardiopata: RiskTier.TIER_3,
  gestante: RiskTier.TIER_3,
  // TIER_2 — risco moderado; autônomo, porém cauteloso.
  'lesao-ortopedica': RiskTier.TIER_2,
  obeso: RiskTier.TIER_2,
  glp1: RiskTier.TIER_2,
  // TIER_1 — população especial controlada; autônomo conservador.
  idoso: RiskTier.TIER_1,
  hipertensao: RiskTier.TIER_1,
  diabetico: RiskTier.TIER_1,
  asma: RiskTier.TIER_1,
  artrose: RiskTier.TIER_1,
  'saude-mental': RiskTier.TIER_1,
};

const TIER_ORDER: RiskTier[] = [
  RiskTier.TIER_0,
  RiskTier.TIER_1,
  RiskTier.TIER_2,
  RiskTier.TIER_3,
  RiskTier.TIER_4,
];

/** Maior tier mínimo entre as flags. TIER_0 quando não há nenhuma. */
export function classify(flags: string[]): RiskTier {
  let tier: RiskTier = RiskTier.TIER_0;
  for (const flag of flags) {
    const flagTier = FLAG_MIN_TIER[flag];
    if (flagTier && TIER_ORDER.indexOf(flagTier) > TIER_ORDER.indexOf(tier)) {
      tier = flagTier;
    }
  }
  return tier;
}

/** TIER_0 a TIER_2: pode gerar de forma autônoma. */
export function canAutoGenerate(tier: RiskTier): boolean {
  return tier === RiskTier.TIER_0 || tier === RiskTier.TIER_1 || tier === RiskTier.TIER_2;
}

/**
 * TIER_3 e TIER_4: encaminha, nunca prescreve.
 *
 * Os dois juntos de propósito — ver o cabeçalho. Se um dia existir revisão
 * profissional no produto, é aqui que os dois voltam a se separar.
 */
export function isReferral(tier: RiskTier): boolean {
  return tier === RiskTier.TIER_3 || tier === RiskTier.TIER_4;
}
