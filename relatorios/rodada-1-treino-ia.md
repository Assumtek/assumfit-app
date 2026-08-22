# Rodada 1: Treino com IA, fluxo completo

**Data:** 30/07/2026 · **Plataforma:** API + simulador iOS (mock) · **Saída:** só relatório local (sem Jira/Slack, por decisão da rodada)

**Bugs: 8 | P0: 3 | P1: 1 | P2: 2 | P3: 2**, os 3 P0 e o P1 corrigidos durante a rodada; o juiz oscilante e os dois P3 corrigidos logo depois (30/07). Aberto ficou só o item de documentação do simulador, já resolvido no CLAUDE.md.

## O que foi coberto

Conta descartável → consentimento → anamnese conversacional (abertura livre → extração → perguntas → finalização) → geração real do plano → check-in → 2 séries de 20 kg × 10 → finalizar → histórico → detalhe da execução → dashboard de progresso → chat com o Personal. Em paralelo: caminho de encaminhamento clínico (PAR-Q positivo) e varredura visual de 16 telas no escuro + 5 no claro.

## Resultado final (após os consertos)

| Passo | Resultado |
| --- | --- |
| Extração da abertura livre | ✅ 5/7 campos (goal, trainPlace, daysPerWeek, minutesPerSession, experience) |
| Geração | ✅ DONE em 110 s, score 7.58, plano de 2 dias (bate com daysPerWeek=2) |
| Execução → finalizar | ✅ check-in 201, séries 204, finish 200 |
| Histórico + detalhe | ✅ treino listado, 2 séries de 20 kg × 10 |
| Dashboard | ✅ 2 séries, volume 400 kg, Leg Press 45° em Quadríceps |
| Chat Personal | ✅ resposta em contexto do plano ativo |
| Encaminhamento (cardiopata) | ✅ REFERRAL em 3 s, sem chamada de modelo, sem plano criado |
| UI escuro/claro | ✅ relevo, hierarquia e estados vazios honestos nos dois temas |

Suítes: **ai 1992 · backend 59 · app 213, todas verdes.**

## Corrigidos durante a rodada

### P0: `fallbacks` da API Anthropic derrubava geração E extração
Sonnet 5 e Haiku rejeitam o parâmetro com 400 (só Opus aceita). A geração falhava como "demorou mais que o esperado" e a extração devolvia `{}` em silêncio, a extração seguia o modelo principal e migrou para o Sonnet junto com ele.
**Conserto:** `fallbacks`/`betas` removidos de `ai/llm/client.py`; extração pinada em `settings.llm_chat_model` (Haiku) em `ai/agent/extract.py`.

### P0: Lesão fantasma: ": " e "Não" viravam flag `lesao-ortopedica`
A tradução da conversa embrulhava o placeholder de pergunta pulada num template (`"cirurgia:: "`) que escapava do filtro, e negativa pura de campo livre ("Não") também era texto truthy. Resultado: **toda anamnese conversacional sem lesão nenhuma** subia para TIER_2 e o juiz de segurança zerava o plano, inclusive na conta silvia.souza@assumtek.com.br, o que explica em parte a nota ruim daquele dia.
**Conserto:** normalizador `dito()` em `backend/src/services/workout/conversation.ts` (só negativa PURA é descartada; "não, mas sinto o joelho" permanece) + limpeza das 3 anamneses contaminadas no banco + 6 testes em `traducao.test.ts`.

### P0: Contrato do plano: exercício por tempo derrubava plano aprovado
O modelo emite `repetitions: null` (e às vezes `sets: null`) em aquecimento por tempo. O Zod do backend rejeitava e um plano com nota 7.58 morria como FAILED "qualidade". O MUVX aceita reps nula pelo mesmo motivo.
**Conserto:** `nullish` no parse (`plan-persistence.ts`), set sem repetição descartado na persistência (a prescrição vive em `duration`/`holdTime`), linha explícita no prompt (`ai/prompts/system.md`) + 3 testes em `plan-parse.test.ts`.

### P1: Contagem de "condições declaradas" incluía flags de perfil
`iniciante`/`40-mais`/`idoso` não são condição clínica, todo iniciante saudável lia "1 condição declarada" no histórico de anamnese.
**Conserto:** filtro `clinicas()` em `AnamnesisHistoryScreen.tsx`. A tela de detalhe ("Condições consideradas") estava correta e não mudou.

## Corrigidos depois da rodada (30/07)

### P2: Juiz `seguranca_clinica` oscilava em perfil limpo
1 de 4 avaliações do mesmo perfil limpo reprovava no hard gate (falso bloqueio ~25%).
**Conserto:** bloqueio por opinião agora exige **maioria de 2 em 3** (`ai/agent/pipeline.py`): plano aprovado não ganha chamada nenhuma; bloqueio vindo só do juiz é re-avaliado até duas vezes (Haiku, barato) e o veredito final é o da maioria. Erro determinístico (validação ou checagem dura) não re-vota. Chave `GRADER_CONFIRM_BLOCKS` desliga. 7 testes em `test_revoto.py`; `agent.run.blocked_detail` no log continua gravando nota e justificativa por juiz.

### P3: Extração não pegava peso/altura explícitos
"Peso 90kg e tenho 1,80m" não preenchia `weightKg`/`heightCm`, número com unidade exigia conversão que o prompt proibia por parecer dedução.
**Conserto:** regra de número + exemplo concreto no prompt do extract (`ai/agent/extract.py`): converter unidade dita para a pedida não é dedução. Verificado ao vivo com a fala exata da rodada: **7/7 em três execuções seguidas** (antes: 5/7).

### P3: Erro de Keychain aparecia como "Sem conexão com o servidor"
**Conserto:** `KeychainSaveError` tipado em `tokenStorage.ts` e mensagem própria no login ("Não foi possível guardar a sessão com segurança neste aparelho") em `auth.store.ts`. O servidor aceitou; era o aparelho recusando gravar, a mensagem agora aponta para o lugar certo.

## Documentado (sem código a mudar)

### P2: Simulador precisa de receita própria (rede + assinatura)
Duas armadilhas encadeadas, ambas com sintoma enganoso:
1. O `.env` aponta a API para o IP da LAN; no simulador só `localhost` conversa com o backend → Metro para simulador precisa de `EXPO_PUBLIC_API_URL=http://localhost:3001` (+ `--clear`, o cache do Metro congela o valor antigo).
2. `CODE_SIGNING_ALLOWED=NO` (receita dos builds de aparelho) quebra o Keychain no simulador → o login salva token via SecureStore, falha, e a tela mostrava **"Sem conexão com o servidor"** com o backend de pé (mensagem corrigida acima). Para simulador: `CODE_SIGN_IDENTITY=-` (assinatura ad-hoc, sem certificado).

Receita registrada no CLAUDE.md, seção de build local.

## Observações (sem ação)

- Toast `[expo-notifications] Error reading persisted…` no simulador: mesma causa do build sem assinatura (`ERR_NOTIFICATIONS_KEYCHAIN_ACCESS`); some com a assinatura ad-hoc. Não usamos push remoto.
- "Tempo total 0 min" no Progresso: correto, a execução do harness durou segundos.
- Clima "São Francisco 16 °C" na Home: localização padrão do simulador; funciona.

## Limpeza

Contas `e2e-rodada1-{a,b,c}@descartavel.local` apagadas via `DELETE /auth/me` (204), assinaturas injetadas removidas em cascata (verificado: 0 órfãs). Metro devolvido à configuração do `.env` (IP da LAN, pulseira real). Anamneses contaminadas pela lesão fantasma corrigidas no banco, incluindo a da conta real.

## Screenshots

Em `/private/tmp/claude-501/-Users-silvia-ASSUMFIT/f4e921c1-628f-4046-8229-5f1971f56b99/scratchpad/` (`dark-*.png`, `light-*.png`), diretório de sessão, copiar se quiser guardar.
