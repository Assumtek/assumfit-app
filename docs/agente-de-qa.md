# O agente de QA: arquitetura e como replicar

Este documento descreve o agente que fecha o ciclo entre o relato de quem testa
e o commit que o resolve. Ele existe e roda em produção no AssumFit desde
agosto de 2026; o que está aqui é o que foi construído, com as decisões que
custaram caro registradas junto, para que outro sistema possa repetir o que
funciona sem repetir os erros.

## 1. O que ele faz

Em uma frase: **ouve as fontes de feedback, classifica cada relato antes de
abrir o código, corrige com evidência, e responde à pessoa que relatou dizendo
em qual versão a correção sobe.**

O ciclo completo, sem intervenção humana entre as pontas:

```
relato → fila → classificação → evidência → correção → teste → commit →
registro no ledger → resposta na mensagem original → (build, quando autorizado)
```

Duas coisas que ele NÃO faz por conta própria, e essa fronteira é deliberada:
**gerar build** e **fazer deploy**. As duas são decisões de quem manda no
produto, e o agente para no relatório que as prepara.

## 2. Princípios

Estes são os que sustentam o resto. Cada um nasceu de um erro real.

1. **Classificar antes de abrir o código.** Dois dos cinco primeiros relatos
   eram pedidos de um recurso que já existia. A correção ali é de
   VISIBILIDADE, não de função, e descobrir isso depois de mexer no código
   custa o dobro.
2. **Evidência antes de correção.** Sem reproduzir ou sem dado de produção que
   confirme, o relato vira hipótese, e hipótese não entra no código. Quando a
   evidência contradiz o relato, o relatório diz isso, com o dado.
3. **Resolveu, responde na mensagem.** Na thread do próprio relato, com o
   commit e a versão em que sobe. Silêncio numa mensagem respondida lê como
   ignorada.
4. **Uma fonte nunca derruba a outra.** A fila do TestFlight não pode morrer
   porque o Slack caiu, e vice-versa. Cada fonte é um `try` isolado.
5. **O estado do que já foi tratado vive no repositório.** Versionado, revisável
   e idempotente: um feedback tratado e esquecido vira retrabalho na rodada
   seguinte.
6. **O agente não lê o que ele mesmo escreveu.** Sem isso, a resposta do bot
   volta como relato novo e o ciclo se alimenta de si mesmo.

## 3. Arquitetura

Três camadas, e a do meio é a única que pensa.

### Fontes

| Fonte | Como é lida | Por quê |
|---|---|---|
| TestFlight (capturas e comentários) | App Store Connect API, `betaFeedbackScreenshotSubmissions` | O painel CORTA o comentário na lista; a API devolve inteiro, com build, aparelho e testador |
| TestFlight (crashes) | `betaFeedbackCrashSubmissions` | Entram na mesma fila, marcados com `[CRASH]` |
| Slack, um canal | `conversations.history` + `conversations.replies` | É onde relatos de WhatsApp são colados, e onde a fundadora decide |

### Despertadores

O agente é uma sessão que precisa ser acordada. Três mecanismos, com papéis
diferentes:

| Mecanismo | Cadência | Papel |
|---|---|---|
| Varredura do TestFlight | 10 minutos | A fonte não tem push; só resta perguntar |
| Slack Socket Mode | tempo real | Conexão de SAÍDA, sem endpoint público nem backend no meio |
| Varredura de segurança | 10 minutos | O socket cai (duas vezes em 24 h, em produção). Mensagem que chega durante a queda não é reentregue; a API de histórico não tem esse problema |

A terceira existe por causa da segunda. Um socket que reconecta sozinho parece
suficiente até você perder um relato.

### Estado

Um arquivo JSON no repositório, `relatorios/bugs/ledger.json`:

```json
{
  "tratados": {
    "<id do feedback>": {
      "commit": "b386f2f",
      "nota": "o texto que a pessoa vai ler",
      "versao": "1.0.5 (9)",
      "em": "2026-08-24T10:12:00"
    }
  }
}
```

A chave é o id da fonte (`AL6V34…` no TestFlight, `slack:1787529155.593489` no
Slack). Pendente é o que não está aqui: a fila é a diferença entre o que as
fontes devolvem e o que o ledger conhece. Não há banco, não há fila persistente,
não há serviço rodando: o estado é um arquivo versionado, e o `git log` do
ledger é o histórico de atendimento.

## 4. Componentes

### `feedback.py` (289 linhas, sem dependências)

Faz cinco coisas, e nenhuma delas é decidir:

- **Autentica na Apple.** JWT ES256 assinado com `openssl` na linha de comando,
  porque a máquina não tinha `pyjwt` e criar dependência para isso não se
  justificava. A conversão DER → raw de 64 bytes é a parte que o JWT exige e
  que quase toda implementação erra na primeira tentativa.
- **Normaliza as fontes num item só.** Toda fonte vira o mesmo formato, e é o
  que permite o resto do fluxo ignorar de onde veio:

  ```
  id, em, build, testador, email, aparelho, comentario, capturas[],
  thread?, em_resposta_a?, thread_ts?
  ```

- **Lê as threads.** A lista do canal só traz o primeiro nível. Um testador
  respondeu dentro das threads e o fluxo não viu: agora cada mensagem com
  respostas é aberta, e as respostas entram na fila com o texto da mensagem
  original como contexto (`em_resposta_a`).
- **Registra e responde** (`--done <id> <sha> "nota"`). Grava no ledger, calcula
  a versão em que sobe lendo o `app.json` (`versão (build + 1)`, porque o campo
  guarda o ÚLTIMO build gerado), e publica a resposta: na thread quando o
  relato tem thread, no canal quando veio do TestFlight, que não tem.
- **Cala a boca quando é o caso** (`--silencioso`). Conversa com a própria
  fundadora e decisões internas entram no ledger sem virar mensagem.

### `slack-socket.py` (88 linhas)

Socket Mode: uma conexão WebSocket de saída, aberta com um token de nível de
app. Cada mensagem de gente vira uma linha no stdout, e é essa linha que acorda
a sessão. Reconecta quando o Slack pede (`disconnect`) e quando a conexão cai.

Nenhum endpoint público, nenhum servidor no meio, nenhum webhook para
autenticar: para um agente que roda na máquina de alguém, isso é a diferença
entre existir e não existir.

### A skill (o procedimento)

O que o agente lê antes de agir. Sete passos, e o segundo é o que economiza
mais tempo:

1. **Ler** as duas fontes na mesma fila.
2. **Classificar** cada pendente em uma de cinco categorias, ANTES de abrir o
   código:

   | Categoria | O que fazer |
   |---|---|
   | defeito | segue para a evidência |
   | recurso que já existe | a correção é de visibilidade: texto, posição, estado vazio que explica |
   | recurso novo | implementa quando a decisão de produto já autoriza; senão, vai ao relatório com estimativa |
   | elogio ou ambíguo | não toca no código; vira pergunta ao testador |
   | já corrigido | aponta o commit e registra, sem mexer em nada |

3. **Reproduzir com evidência**, nunca por hipótese: banco de produção (só
   agregados, nunca valor identificado), log de acesso, log da aplicação, e o
   número do build que o relato traz.
4. **Corrigir** no lugar de origem: domínio antes de tela, ponte antes de store.
5. **Verificar**: as três suítes, sempre.
6. **Commitar, empurrar, registrar** e responder.
7. **Relatório da rodada**, terminando com o que só a pessoa que manda decide.

### O agente

Uma sessão de Claude Code com acesso ao repositório, aos scripts e às
credenciais locais. É ele que classifica, investiga, escreve o código, roda os
testes, redige a mensagem e decide quando perguntar em vez de adivinhar.

O que faz a diferença na prática não é o modelo: é a fila normalizada, o
procedimento escrito e a evidência obrigatória. Sem isso, o mesmo modelo
produz correções plausíveis para problemas que ninguém tem.

## 5. Decisões que custaram caro

Registradas porque cada uma nasceu de um defeito real em produção.

- **A API, não o painel.** O App Store Connect corta o comentário na lista, e a
  coleção só responde pelo relacionamento do APP: as rotas direta e por build
  devolvem 403 ou "não existe".
- **O bot moderno não tem `subtype`.** O filtro que ignorava `bot_message` não
  via as próprias mensagens do fluxo, e elas voltavam como relatos. O filtro
  certo é por `bot_id`.
- **Thread não aninha.** Responder a uma mensagem que já está numa thread exige
  descobrir a raiz (`thread_ts`); mandar para o `ts` da resposta cria uma
  conversa paralela que ninguém lê.
- **O socket cai.** Reconexão automática não recupera o que chegou durante a
  queda. A varredura por API é a rede embaixo.
- **A versão vem do arquivo, não de um contador.** O `buildNumber` do `app.json`
  guarda o último build GERADO, então a resposta diz `build + 1`. Um contador
  próprio (o do serviço de build, por exemplo) desalinha do que a pessoa lê na
  loja.
- **Relato repetido é sinal, não ruído.** Dois testadores no mesmo ponto em
  poucas horas mudou a prioridade de uma faixa de calorias que estava "ok".
- **Um relato pode conter um defeito que ninguém reportou.** A captura de um
  testador que perguntava como a medição funcionava mostrava, no mesmo
  gráfico, o eixo do tempo fora de ordem. Ler a evidência inteira, e não só a
  frase, é parte do trabalho.

## 6. Como replicar

### O que é genérico

O desenho não depende de Apple nem de Slack. O que ele exige é:

1. **Uma ou mais fontes que devolvam relatos com id estável.** Qualquer coisa
   serve: Play Console, GitHub Issues, Linear, Discord, Zendesk, um formulário.
2. **Um normalizador por fonte**, que devolva sempre o mesmo item. É o contrato
   que mantém o resto do sistema ignorante da origem.
3. **Um ledger versionado**, com id da fonte como chave.
4. **Um despertador por fonte**: push quando existir, varredura quando não.
   Se houver push, tenha varredura também.
5. **Um procedimento escrito**, com as categorias e a ordem dos passos. Esta é
   a peça que mais muda o resultado e a que mais se subestima.
6. **Um canal de resposta que chegue a quem relatou**, de preferência no mesmo
   lugar onde ele falou.

### Checklist de implementação

- [ ] Credenciais fora do repositório, em arquivo de ambiente com permissão
      restrita. Nada de token no código nem no histórico do git.
- [ ] Um `normalizar()` por fonte, devolvendo o item comum.
- [ ] `pendentes = fontes - ledger`, e nada mais define a fila.
- [ ] Cada fonte dentro do próprio `try`: a falha de uma não derruba a fila.
- [ ] Filtro para não reprocessar o que o próprio agente escreveu.
- [ ] Comando de registro que grave o ledger E responda, no mesmo passo. Se
      forem dois comandos, um dia alguém faz só o primeiro.
- [ ] Modo silencioso para conversa interna.
- [ ] Varredura periódica mesmo onde houver push.
- [ ] O procedimento escrito, versionado junto do código.

### O que trocar por plataforma

| Peça | AssumFit | Equivalente |
|---|---|---|
| Fonte de app | App Store Connect API | Play Console (Reviews API), Firebase App Distribution |
| Autenticação | JWT ES256 com chave `.p8` | OAuth de serviço, chave de API |
| Canal humano | Slack (bot token + Socket Mode) | Discord (gateway), Teams, Telegram |
| Ledger | JSON no repositório | O mesmo, ou uma tabela se houver concorrência real |
| Despertador | varredura + socket | cron + webhook |

### O que NÃO replicar sem pensar

- **A fronteira do build e do deploy.** Aqui ela é rígida porque quem manda no
  produto quer decidir cada envio. Em outro time, o agente pode ter permissão
  de subir sozinho, e aí a arquitetura muda: precisa de portão de qualidade
  automatizado no lugar da pessoa.
- **A regra de responder sempre.** Ela pressupõe um grupo pequeno de testadores
  que se conhecem. Com mil relatos por dia, responder um a um é ruído.

## 7. Limites conhecidos

- **Não há concorrência.** O ledger é um arquivo, e duas sessões escrevendo ao
  mesmo tempo se sobrescrevem. Nunca aconteceu porque só existe uma sessão; num
  time maior, isso vira uma tabela.
- **A fila é por id, não por conteúdo.** O mesmo relato feito duas vezes em
  fontes diferentes aparece duas vezes, e quem percebe é o agente ao ler.
- **A varredura custa uma chamada de API a cada dez minutos, por fonte.** Em
  escala maior, use o cursor da fonte em vez de reler a janela inteira.
- **Anexos são baixados sob demanda** e as URLs expiram rápido: baixe na hora
  de ler, não depois.
