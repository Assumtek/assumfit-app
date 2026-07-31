---
target: a tela de esporte
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 1
timestamp: 2026-07-31T02-37-57Z
slug: app-src-screens-sportscreen-tsx
---
Method: dual-agent (A: revisão de design · B: detector determinístico) · Modo Operate · Alvo: app/src/screens/SportScreen.tsx

## Design Health Score — 28/40 (Good)

| # | Heurística | Nota | Issue-chave |
|---|-----------|------|-------------|
| 1 | Visibilidade do estado do sistema | 3 | bpm rotulado "ao vivo" (:504-507) sem checagem de frescor — pulseira desconectada, número congela com selo de vivo; histórico sem estado de carregamento |
| 2 | Correspondência com o mundo real | 3 | Com `maxHr` presente o rótulo "médio" some (:400-404) — "172 bpm / máx 185" exige inferência; caloria omite o peso fixo de 70 kg (:46) |
| 3 | Controle e liberdade | 2 | Menu do header ativo durante a sessão: navegar para rota já na pilha desmonta a tela e o cleanup (:353-361) mata a sessão sem salvar — a seta guarda, o menu ao lado não |
| 4 | Consistência e padrões | 3 | Ordem das métricas troca entre vistas (bpm↔kcal no slot do meio); `aviso` com 3 apresentações; `<Text>` cru fora da escala (:655, :682); "Concluir" vs "Voltar" para a mesma saída |
| 5 | Prevenção de erros | 3 | Preparando + modal + descarte de <60s são exemplares; minados pelos buracos de H3/H9 |
| 6 | Reconhecimento vs. memorização | 3 | Pace (métrica-mãe do corredor) em sub-rótulo de 11px; ambiguidade médio/máx |
| 7 | Flexibilidade e eficiência | 3 | Ilha com pausar/retomar/encerrar e instante real do toque — genuinamente bom; falta "repetir última atividade" |
| 8 | Estética e minimalismo | 3 | Rodapé fixo de duas frases (:552-555) contraria a decisão de jul/2026 — a 2ª frase é explicação de método, morada da Ajuda |
| 9 | Recuperação de erros | 2 | Falha de salvamento promete "reaparece ao sincronizar" e NÃO existe fila de sync para esporte; percurso local só grava após sucesso do POST — na falha perde-se tudo |
| 10 | Ajuda e documentação | 3 | Documentação contextual boa (preparando, empty state); sem ponte para Ajuda na caloria estimada |
| **Total** | | **28/40** | **Good** |

## Veredito de especificidade

**Meio a meio — os FLUXOS são deste produto; as VISTAS são do gênero.** Inconfundivelmente AssumFit: a tela "O que será medido" (ritual de honestidade que nenhum Strava tem), a privacidade como UX (trilha só no aparelho, share sem mapa/endereço), o `~` na caloria, o traço sem GPS. Intercambiável: vista ao vivo e resumo são a convenção do gênero. A ausência mais grave: **a sessão de esporte não toca o score de energia em momento nenhum** — o Foco grava `energyScoreAtStart`, a Agenda pinta as janelas; o Esporte, a intervenção mais forte no corpo, não lê nem escreve na alma do produto.

**Scan determinístico:** limpo (0 achados em 777 linhas). Zero cor crua, zero StyleSheet.create, zero barril tamagui, pesos tipográficos vindos da escala — a disciplina de tokens está impecável. A varredura mecânica achou: linha do histórico (:696) com `accessibilityRole="button"` sem `accessibilityLabel` (concorda com a revisão de design), cast duplo `as any`/`as never` (:638), espaçador vazio de 52px (:548), indentação torta (:697-709). Sem overlay de browser: alvo é app nativo, sem superfície web.

## Impressão geral

A infraestrutura da tela é excelente — o rigor temporal da ilha, a preparação com prova visual de GPS, a privacidade encarnada — mas a confiabilidade na SAÍDA não honra a confiança que a ENTRADA constrói: os dois piores achados (perda de treino por falha de rede com promessa falsa; menu que mata a sessão sem confirmar) estão no fim da jornada, exatamente onde o custo emocional é maior. E o pico-fim (resumo) enumera números crus em vez de avaliar — a regra de ouro do produto quebrada no momento de recompensa.

## O que funciona

1. **"O que será medido"** (:565-621) — melhor peça da tela: permissão de GPS virou confirmação visual, início acidental impossível, "medido ou traço" materializado ANTES da medição.
2. **Rigor temporal da ilha** (:287-336) — ações drenadas com o instante real de cada toque; pausa entre encerrar não vira treino. Invisível e exatamente certo.
3. **Privacidade como UX** — trilha chaveada por id no aparelho, fallback honesto no detalhe, share que desenha o traçado sem mapa.

## Issues prioritárias

**[P0] Falha de salvamento perde o treino e mente sobre isso** — :262-263 promete "reaparece ao sincronizar", mas sync.service.ts não tem fila de esporte (verificado), e o percurso local só é gravado após sucesso do POST (:243-257): na falha perde-se servidor E aparelho. Viola o princípio nº 1 do produto no único erro grave da jornada. **Fix:** persistir a sessão em arquivo local ANTES do POST, reenviar na próxima abertura/pull-refresh, botão de retry no resumo. **Comando:** /impeccable harden

**[P1] O menu durante a sessão é uma porta para o abismo** — o hambúrguer do DetailScreen fica ativo; a Sidebar navega via navigationRef (verificado) e uma rota já na pilha faz POP: SportScreen desmonta, cleanup (:353-361) mata watcher e ilha, sessão nunca salva. A seta a 40px dali cobra modal. **Fix:** com sessão ativa, interceptar (beforeRemove ou prop no DetailScreen) reutilizando `confirmarEncerrar`. **Comando:** /impeccable harden

**[P2] "ao vivo" sem prova de vida** — :504-507 exibe `latest.heartRate` sem checar `recordedAt`; número congelado segue dizendo "ao vivo". Num produto de saúde, é o único lugar onde a tela pode mentir sem saber. **Fix:** limiar de frescor (>15s → traço + "sem sinal da pulseira"). **Comando:** /impeccable harden

**[P2] O resumo não avalia; só enumera** — :383-414 é número cru em todas as posições; nenhuma linha em linguagem humana, nenhuma ponte com a energia. Quebra a regra de ouro no pico-fim. **Fix:** função de domínio testável devolvendo a frase de avaliação (RatingText acima das métricas), com ponte sóbria para o score. **Comando:** /impeccable delight

**[P3] "0,00 km" quando não há medição** — :499 na vista ao vivo com GPS negado/sem fix; o resumo já trata (0 → traço). **Fix:** traço enquanto `points.length === 0`, rótulo "aguardando GPS". **Comando:** /impeccable polish

## Red flags por persona

**Riley (stress tester):** swipe-kill no minuto 30 → sessão só em memória, tudo perdido, e a Live Activity pode sobreviver órfã contando treino que não existe; encerrar pela ilha aos 50s → descarte em silêncio absoluto; túnel → distância para de crescer sem sinalização de sinal degradado.

**Casey (uma mão, suado):** o terceiro slot dos controles é um espaço invisível de 52px (:548) — toque ali = nada, sem feedback; a instrução operacional mais importante ("mantenha a tela aberta") está em Data 12px muted no lugar que ninguém lê.

**Sam (VoiceOver):** `Medida` não agrupa — 9 paradas para ler o trio, pace com apóstrofos lido como ruído; PAUSADO↔EM ANDAMENTO não anunciado (pausa pela ilha é muda na tela); linha do histórico sem label ("til 342 kcal").

## Observações menores

- `aviso` único para 4 vistas com 3 apresentações; `$destructive` para erro de rede estica a regra; não é limpo ao sair do resumo (Note perene).
- :610 é código morto (`aviso && !preparando.gps` nunca é verdadeiro).
- Cartão Musculação (:643-662): acento em borda + ícone + seta de navegação — atrito com a regra 2 e com "não escreva Pressable com pill de acento à mão".
- Ordem das métricas inconsistente entre vistas; "Voltar" duplica a seta no detalhe.
- Peso fixo 70 kg sem disclosure na UI; grade de 8 tiles sem "recente primeiro"; sem loading do histórico.

## Perguntas para considerar

1. **Onde o esporte encontra a alma do produto?** Se a corrida não muda o que o app diz amanhã de manhã, por que ela mora aqui e não no Strava?
2. Se caloria por foto é obrigada a aparecer como FAIXA, por que a caloria por MET — chutada com peso que o usuário nunca informou — é número pontual em quatro vistas?
3. "Sessão de tela aberta" é limitação honesta ou dívida disfarçada de aviso? O buraco do menu existe HOJE e não depende do background GPS.
