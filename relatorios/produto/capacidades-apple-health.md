# O que vale trazer do Health e do Fitness da Apple

Análise pedida em 23/08/2026, a partir do vídeo de 1min55s gravado pelo Leonardo
(tela do iPhone dele, apps Fitness e Saúde) e do estado atual do AssumFit.

Nota de privacidade: o vídeo mostra dados de saúde identificáveis do Leonardo
(peso, percentual de gordura, batimento). Nada disso foi copiado para este
documento nem para o relatório publicado; só a ESTRUTURA das telas.

## 1. O que o vídeo mostra

**Fitness:** três anéis do dia, uma fita com a semana inteira em sete anéis
pequenos no topo, o gasto do dia distribuído por hora com o total do dia,
sessões de treino, dicas de treinador, medalhas (365 metas fechadas, desafio de
março), e um bloco de tendências que compara janelas longas ("Movimento, 125
cal por dia, em queda").

**Saúde:** um resumo com métricas FIXADAS que a pessoa escolhe e reordena, uma
lista única com todos os dados de saúde, cada métrica com a data da última
medição, e a tela de detalhe com seletor de dia, semana, mês e ano, um texto
"sobre esta métrica" no fim, "fixar no resumo" e "fontes de dados e acesso".

## 2. O que o AssumFit já tem

| Capacidade da Apple | No AssumFit |
| --- | --- |
| Anel de movimento do dia | Metas do dia, com anel e calendário de 28 dias (feito ontem) |
| Medalhas anuais | `domain/achievements.ts`, sobre esforço, em semanas, não em dias |
| Sessões de treino | Esporte e histórico |
| Dicas de treinador | Personal com IA, que responde ao dia da pessoa |
| Nota de sono | Score de sono próprio, com detalhe da noite |
| Importar do iPhone | HealthKit já ligado, `services/health.service.ts`, **só sono, só leitura** |
| Tendência com seta | Indicadores da Home, com seta verde e vermelha |

O ponto importante da tabela é a última linha da esquerda: a ponte com o
HealthKit **existe e funciona**, e foi deliberadamente estreitada a um dado só.

## 3. O que vale trazer, em ordem

### 1. Passos, distância e andares do iPhone

Hoje, sem a pulseira no pulso, o dia fica em branco. No vídeo, o iPhone sozinho
contava 476 passos, 0,29 km e 1 andar subido, e a pessoa não fez nada para isso.

A ponte já está montada: é ampliar o pedido de permissão de `SleepAnalysis`
para `StepCount`, `DistanceWalkingRunning` e `FlightsClimbed`. E aqui não existe
o problema que fechou a porta para o resto: passo é contagem, não método. Ao
contrário do HRV, onde o Apple Watch reporta SDNN e a pulseira reporta RMSSD, e
misturar quebra a linha de base que é o denominador do score inteiro.

O cuidado real é dupla contagem: pulseira e telefone contam o MESMO passo. A
regra tem que ser por hora e por fonte, a maior das duas, com a pulseira
preferida quando esteve conectada naquela hora.

Custo médio. Muda o texto de permissão e a descrição na App Store.

### 2. A semana em fita, no topo

Sete anéis pequenos, um por dia, com o de hoje marcado. É a peça mais barata do
vídeo e a que mais dá sensação de continuidade: mostra que ontem existiu.

Cabe na Home, acima do resumo, ou no topo de Metas do dia. O dado já está todo
calculado em `aneisDoCalendario`.

Custo baixo.

### 3. O gasto distribuído ao longo do dia

O gráfico de barras por hora, com o total do dia embaixo. Responde a uma
pergunta que nenhuma tela nossa responde hoje: em que horas do dia eu me mexo.

As leituras por hora de 30 dias já estão no backend e a `MetricDayScreen` já as
recompõe. É gráfico novo sobre dado existente.

Custo baixo a médio.

### 4. Tendência de verdade, não comparação com ontem

A Apple compara os últimos 90 dias com os 365, e diz a diferença por dia. As
setas da nossa Home comparam com a meta ou com o próprio dia, o que oscila
demais para significar alguma coisa.

Uma janela longa contra outra é o que transforma número em progresso, e é
exatamente o que o Leonardo pede quando fala em ver evolução.

Custo médio, e depende de acumular série. O banco já guarda; o app hoje carrega 30 dias.

### 5. Deixar a pessoa escolher o que fica no topo

"Fixados", com um botão de editar. A Apple não decide a hierarquia da tela
inicial, ela dá a decisão para quem usa.

Isso resolve de raiz o desacordo sobre a Home: em vez de você e eu escolhermos
por eles, cada um fixa o que olha. Quem quer anel de caloria fixa caloria; quem
quer sono, fixa sono.

Custo médio. É a mudança de Home mais defensável que existe hoje.

### 6. Uma lista única com todos os dados, e as fontes

Hoje as métricas moram em telas espalhadas pelo menu lateral. Uma lista só, com
busca e a data da última medição de cada uma, torna o app navegável quando ele
crescer.

Junto vem "fontes de dados e acesso", que diz de onde veio cada número
(pulseira, iPhone, digitado). Isso é bom de produto e é bom de LGPD: dado
sensível com procedência visível para o dono.

Custo baixo a médio.

### 7. Dia, semana, mês e ano em toda métrica

Só a tela de refeições tem seletor de período hoje. O mesmo controle em todas as
métricas é consistência barata e transforma cada tela em histórico.

Custo baixo por tela.

### 8. As conquistas fora da tela de fim de treino

Elas existem, estão testadas, e só aparecem no minuto seguinte a um treino
terminar. Quem não treinou hoje nunca as vê. Um bloco discreto no resumo resolve.

Custo baixo.

## 4. O que não trazer

**Compartilhar com outras pessoas (a aba Sharing).** Exige contas enxergando
contas, dado sensível saindo do dono, base de amizades e consentimento
específico. Toda a arquitetura hoje assume que só o usuário vê os próprios
dados. Se você quiser, é projeto, não recurso.

**HRV e batimento vindos do Apple Watch.** É a regra da linha de base por fonte:
SDNN e RMSSD não são comparáveis, e a média dos dois não corresponde a nenhum
método. Continuaria valendo mesmo depois de importar passos.

**Escrever no app Saúde.** Cria laço: publicamos um número e depois o lemos de
volta como se fosse de outra fonte. O serviço já documenta essa recusa.

**Medalha de 365 dias.** A nossa regra é conquista de esforço, contada em
semanas. Uma medalha diária de um ano ensina a pessoa a fechar o anel doente, e
é o oposto do que a home passou a incentivar em agosto.

**Card de dica genérica.** "Deixe a ioga mais fácil se você tem quadril travado"
sem relação com o dia da pessoa é o tipo de conteúdo que dá cara de app
genérico. Nosso equivalente é o personal, que sabe o que ela fez ontem.

## 5. O que só você decide

1. Passos do iPhone entram? Muda permissão, texto da loja e a promessa do produto
   (o app passa a valer alguma coisa sem a pulseira no pulso).
2. Home configurável, ou hierarquia decidida por nós?
3. Tendência de janela longa exige acumular dados. Começamos a guardar agora?

Recomendação: 1, 2 e 5, nessa ordem. As três primeiras entregas somam menos de
uma semana e cobrem o que os testadores pediram até aqui.
