# Rodada de testes — 22/08/2026 — o que entrou nos últimos pedidos

Adaptação do orquestrador do MUVX ao AssumFit: simulador iOS (iPhone 17 Pro, iOS 26)
com a pulseira em **mock**, contra **produção** com a conta de teste
`silvia.souza+rodada1@assumtek.com.br`, relatório privado (artefato) + resumo no chat.
Bugs encontrados entram no fluxo de bugs do AssumFit (correção, commit, ledger).

Severidade: P0 crash/bloqueio/perda de dados · P1 dado errado persistido ou fluxo
importante degradado · P2 UX quebrada · P3 cosmético.

## Limites conhecidos desta rodada (não contam como bug)

- **Produção está sem os deploys de hoje** (porta 22 fechada para este IP): rota
  `/client-errors`, motivo da transcrição, vídeos dos exercícios, fundamentação
  reescrita e o filtro "prazo ≠ frequência" da anamnese ainda não estão no ar.
  Cenários que dependem deles ficam como **PENDENTE DE DEPLOY**.
- **Simulador não tem Bluetooth**: a pulseira é mock (batimento 44–88, ~100
  passos/min, sem memória de sono, sem filtro de avisos). Ficam só para o aparelho:
  widget de água, despertador (AlarmKit), ilha no descanso, avisos no pulso por
  categoria, noite partida por levantada, aviso de batimento parado, "Começou a
  treinar?" (o mock não passa de 88 bpm), plausibilidade de kcal/distância com valor
  real da pulseira.
- Ditado por voz: o simulador não grava áudio.

## Cenários

| # | Cenário | O que conferir | Testável aqui? |
|---|---|---|---|
| 1 | Cadastro + login da conta de teste | entra, home carrega, frase da Saúde vem do modelo (não do molde) | sim |
| 2 | Água: meta 35 ml/kg | com peso 60 kg na anamnese → meta 2,1 L; sem peso → 2,0 L (f) | sim |
| 3 | Água: registrar e remover gole | total e anel; remover um gole do meio | sim |
| 4 | Lembrete de água: hora digitada | "ou digite" aceita 7:55 e 0755, recusa 24:00; teclado não cobre o campo | sim |
| 5 | Lembrete de refeição: hora digitada | idem | sim |
| 6 | Sono sem noite | tela diz "nenhuma noite"; sem seção de oxigênio | sim (estado vazio) |
| 7 | Bateria do corpo | frase de abertura abaixo da avaliação | sim (se houver noite) / vazio |
| 8 | Anamnese por conversa | responde "hipertrofia em 3 meses, foco em ombros, peito e costas" → não deve anotar 3 dias/semana | PENDENTE DE DEPLOY (filtro na IA) |
| 9 | Geração do plano | plano entregue; Meu projeto **sem** fundamentação técnica | sim (tela) |
| 10 | Check-in: "Ajustar o treino de hoje com o personal" | abre chat já com a frase | sim |
| 11 | Treino guiado: chip bpm/kcal | bpm do mock ao lado do cronômetro; kcal só com peso | sim |
| 12 | Treino guiado: alongamento conta no progresso | concluir exercício por tempo → barra de fases avança | sim |
| 13 | Treino guiado: cancelar check-in | diálogo → cancela → volta ao Plano sem fechar o app | sim |
| 14 | Treino guiado: concluir treino | tela de fim, sem crash; compartilhar com selo "TREINO CONCLUÍDO" | sim |
| 15 | Plano: "Fazer o de ontem que ficou" | com dia passado sem registro, botão aparece e abre o check-in certo | sim (se o plano tiver dia anterior) |
| 16 | Compartilhar atividade/saúde/progresso | selo por origem, não "treino concluído" | sim |
| 17 | Atividade: distância/kcal plausíveis | com o mock (~7.900 passos) → ~5,5 km estimados, ~316 kcal, rotulados "estimada" | sim |
| 18 | Vídeos dos exercícios | thumbnail + play acima do exercício | PENDENTE DE DEPLOY (API sem videoUrl) |
| 19 | Erro de JS não mata o app | tela de recuperação | sem gatilho no simulador |
