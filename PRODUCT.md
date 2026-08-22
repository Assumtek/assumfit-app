# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

(App React Native/Expo que roda também em Android com a MESMA linguagem visual;
o iPhone é a referência que lidera as decisões: Liquid Glass, Dynamic Island,
vidro do iOS 26. Confirmado pela fundadora em jul/2026.)

## Users

Público amplo, sem recorte demográfico (decisão da fundadora): qualquer pessoa
que queira entender o próprio corpo. B2C puro, o usuário é a pessoa física e
só ela vê os próprios dados. **Não existe empresa, gestor, RH nem visão de
time em lugar nenhum**; requisito que peça agregação entre usuários é sinal de
erro de tradução.

## Product Purpose

Assinatura mensal com wearable próprio incluído (AssumFit Watch) que lê
biometria ao vivo e a transforma em: score de energia com insight do dia,
cronótipo, idade biológica, treino de musculação gerado por IA, registro de
esporte com GPS, contagem de calorias por foto do prato (tabela TACO), sessões
de esporte com GPS, ciclo menstrual, água e sono. Sucesso é a pessoa treinar, se mover e
recuperar no dia certo, decidido pelo que o corpo mediu, não por número
inventado.

**Reposicionamento (ago/2026, decisão da fundadora):** o app incentiva
primariamente o treino/esporte, o bem-estar e a recuperação. O score fala
"prontidão" na tela; a ação sugerida da home é sempre movimento ou recuperação.
Sessão de foco e agenda de terceiros SAÍRAM do produto (ago/2026): nem como
ação da home, nem como tela de menu, produtividade não é o assunto do app.

## Positioning

Confirmado pela fundadora, em três pilares que um concorrente não copia junto:

1. **Preço com aparelho incluso**, assinatura mensal acessível com a pulseira
   dentro; sem os R$ 2.000+ de entrada de um Garmin/Apple Watch.
2. **Feito para o Brasil**, pt-BR de verdade: tabela nutricional TACO, prato
   brasileiro na análise de foto, linguagem local, LGPD por desenho.
3. **IA que age, não só mede**, treino gerado e ajustado por IA, calorias por
   foto, personal no chat com voz; orientação ativa em cima da medição.

## Operating Context

- A pulseira (Staranb ANB-X1, família H59) fala pelo SDK do fabricante
  (QCBandSDK), não por GATT padrão. Sem sensor de temperatura. Estresse e HRV
  têm liga/desliga no firmware, separado da capacidade.
- App em **pt-BR** (UI, docs, commits); identificadores de código em inglês.
- Monorepo: `app/` (RN + Expo, CNG/prebuild, EAS), `backend/` (Node + Express
  + Prisma + TimescaleDB), `ai/` (Python + FastAPI, fonte da verdade dos
  modelos), `deploy/` (site institucional + Caddy + compose de produção).

## Capabilities and Constraints

- **Não é dispositivo médico.** Sem diagnóstico, alerta clínico ou recomendação
  de tratamento em nenhuma tela. Explicações de método moram na tela de Ajuda,
  nunca em rodapé fixo de tela de métrica.
- Dado biométrico é dado pessoal sensível (LGPD art. 5º, II): consentimento
  vinculado, retenção definida, nunca logar valor biométrico com `user_id`.
- Privacidade por desenho: foto de refeição e trilha de GPS ficam SÓ no
  aparelho; o servidor analisa e descarta. Áudio de ditado expira em 1 dia.
- Toda métrica exibida passa por avaliação em linguagem humana
  (`domain/ratings.ts`); nenhuma tela formata número cru. Sinal ausente mostra
  traço e tem o peso redistribuído, nunca valor inventado.
- Score de energia e idade biológica existem em dois lugares (TypeScript
  offline no app, Python como fonte da verdade) com teste de paridade que
  impede divergência silenciosa.
- Calorias: visão identifica alimento e estima gramas; a caloria é
  determinística da TACO. O que o modelo chuta é reserva, e aparece como FAIXA.

## Brand Commitments

- Marca **AssumFit** (da AssumTek); manual de marca em `app/assets/brand/`.
- Paleta oficial do manual é vinculante: `ink`, `text` e o acento roxo
  `#877BF0`, nunca o verde do MUVX, mesmo ao portar composição de lá.
- Logotipo e símbolo são vetores oficiais (`components/Logo.tsx`), regerados do
  SVG, nunca editados à mão nem substituídos por texto.
- Voz: português direto, segunda pessoa, tom sóbrio e adulto; sem exclamação,
  sem emoji, sem gíria; avaliação em linguagem humana como destaque, número
  técnico como sub-rótulo.
- O AssumFit é produto independente; consistência com o MUVX não é argumento
  técnico (a composição visual do treino veio de lá por decisão explícita, com
  a identidade daqui).

## Evidence on Hand

- Conta demo de revisão funcional em produção (api.assumfit.com.br).
- Seed local: 5 perfis de personas, 30 dias, ~42 mil leituras.
- Site institucional + política de privacidade em `deploy/site/` (política
  vigente servida em api.assumfit.com.br/privacidade).
- Aparelho físico real em uso pela fundadora (iPhone + AssumFit Watch).
- **Não existem ainda:** depoimentos, casos, números de clientes, imprensa, nenhuma peça futura pode inventá-los.

## Product Principles

1. **Medido ou traço.** Sinal ausente não vira número; a honestidade do dado é
   inegociável mesmo quando não é o argumento de venda.
2. **A avaliação fala, o número acompanha.** Linguagem humana em destaque;
   faixa honesta vale mais que precisão de mentira.
3. **Privacidade é arquitetura, não página.** O que pode ficar no aparelho fica
   no aparelho; o que sobe, sobe sem identidade ou morre depois do uso.
4. **A IA orienta, nunca cobra nem diagnostica.** Ausência só vira nota em hora
   plausível; conselho é de treino, movimento e bem-estar, não clínico.
5. **iOS primeiro, uma linguagem só.** O iPhone define a régua (vidro, ilha,
   materiais); o Android recebe a mesma identidade, não uma tradução.
