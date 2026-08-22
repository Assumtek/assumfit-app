# Plano de execução — AssuмFit

> Base: [SPEC.md](SPEC.md) v2.0. Este documento é o que muda a cada semana; a SPEC só muda quando o produto muda.

## Estado atual (27/07/2026)

| Item | Situação |
| --- | --- |
| Especificação de produto | ✅ v2.0, design system reescrito para minimalismo clínico |
| Hardware Staranb ANB-X1 | ⚠️ amostra em mãos — é um **H59 da Shenzhen Tianpengyu** rebatizado, app do fabricante "Qwatch Pro" |
| Protocolo BLE | ✅ identificado: família **Colmi R02/R03**, documentado em código aberto — implementado em `colmiProtocol.ts` |
| Mockup `assumfit-app.html` | ✅ em [mockups/](mockups/) |
| Mockup `assumfit-productivity.html` | ⬜ nunca recuperado |
| App — telas e design system | ✅ 17 telas, kit de gráficos, verificado no simulador |
| App — autenticação | ✅ login, cadastro, consentimento LGPD, Keychain |
| App — tema claro/escuro | ✅ sistema/claro/escuro, persistido; exige rebuild para “sistema” valer |
| App — perfil e configurações | ✅ cadastro editável, assinatura, consentimentos, sair, excluir conta |
| Backend — API e banco | ✅ testado por `curl`: auth, ingest idempotente, séries, baseline |
| Integração app ↔ backend | ✅ fila de sincronização testada; falta exercitar pela interface |
| Serviço de IA (Python) | ✅ energia, bio age, cronótipo, correlações, insight da home — 37 testes |
| IA no caminho do usuário | ✅ home consome `/insights/energy`; job horário grava `energy_scores` e `bio_age_scores` |
| Onboarding de rotina | ✅ perguntas ramificadas, perfil alimentando o modelo |
| Testes | ✅ 81 no app, 1961 no serviço de IA (personas × 24h), incluindo paridade TS↔Python |
| Preparo de produção | ✅ compose de prod, TLS por Caddy, Redis, backup verificado, imagem sem toolchain, encerramento gracioso |
| LGPD | ✅ consentimento por finalidade, exclusão real, **exportação de dados** (Art. 18 II e V) |
| Seed | ✅ 5 perfis fisiológicos, 30 dias, ~42 mil leituras |

### O que foi fechado

As três lacunas do levantamento anterior estão resolvidas. A cadeia inteira foi
exercitada de ponta a ponta com dado semeado: baseline de HRV converge e separa
os perfis (atleta 91 ms, sedentário 24 ms), o score de energia sai do modo
calibrando, e a API busca o cálculo no serviço Python.

A duplicação da matemática entre TypeScript e Python foi mantida de propósito —
o app precisa funcionar sem rede — e está protegida por teste de paridade que
roda as duas implementações sobre os mesmos casos.

### O que ainda falta

**Onde está o HRV — questão em aberto, não impedimento.**

A amostra é um H59 (Shenzhen Tianpengyu) e fala o protocolo serial da família
Colmi R02/R03. Ele **não expõe o perfil padrão do Bluetooth SIG** (0x180D), e os
comandos já mapeados entregam o batimento calculado, sem intervalos RR.

Cheguei a registrar aqui que o aparelho "não mede HRV". **Estava errado** — o
app do fabricante (Qwatch Pro) mostra HRV, então o sensor entrega. A conclusão
foi generalizada a partir do subconjunto do protocolo que encontrei em fontes
abertas, e o subconjunto não é o protocolo inteiro.

Restam três hipóteses, em ordem de probabilidade:

1. **Existe comando não mapeado** que devolve HRV ou os intervalos RR. As fontes
   abertas cobrem os anéis Colmi, não este firmware — o H59 pode ter comandos a
   mais.
2. **O HRV vem no histórico**, junto com sono, e não em tempo real.
3. **O app calcula** a partir de PPG bruto, e existe comando para o sinal cru.

Como descobrir, na ordem certa de custo: capturar o tráfego BLE do Qwatch Pro
(no Android dá para ativar o *HCI snoop log* e abrir no Wireshark — é o caminho
mais direto e não depende de ninguém), varrer comandos com o Diagnóstico GATT, e
pedir a documentação ao Tianpengyu, que faz ODM e deve ter SDK.

**Ainda depende de hardware:** SpO₂ e temperatura (subtipos a confirmar) e
validação do batimento contra um Polar H10.

**Depende de decisão ou credencial:** cobrança de assinatura, HealthKit e
Health Connect.

**Clima ambiente — feito, com ressalvas.** `GET /weather` busca temperatura,
umidade e sensação térmica por coordenada, com cache de 30 min por célula de
~11 km. A coordenada **não é persistida em lugar nenhum** — vira chave de cache
arredondada e é descartada.

Duas ressalvas registradas no código:

- O ambiente **não corrige o score de energia em silêncio**. Ele gera uma frase
  de contexto ("o calor eleva a FC de repouso; parte de uma queda hoje pode ser
  ambiente, não fadiga"). Ajustar o número por trás exigiria um coeficiente que
  eu não teria como justificar, e esconderia o raciocínio de quem lê a tela.
- **Clima externo não é o quarto.** A pessoa dorme dentro de casa, muitas vezes
  com ar-condicionado. Para o insight de sono — que é o mais valioso, porque
  acima de ~24°C o sono profundo degrada — o dado externo é proxy com erro real.
  O caminho preciso seria o wearable expor leitura ambiente: o ANB-X1 tem NTC,
  mas a spec diz que ele mede pele. **Mais uma pergunta para o Staranb**, junto
  das três do IMU.

**Trabalho de código pendente:** notificações inteligentes, tela de padrões e
correlações consumindo `/insights`, e exercitar cadastro e login pela interface
— hoje validados por `curl` e por teste, não por toque na tela.

**Rebuild pendente.** `app.json` saiu de `userInterfaceStyle: "dark"` para
`"automatic"`, que é config nativa: no binário instalado hoje o iOS ainda trava
a aparência, então o modo "Sistema" não acompanha o aparelho. Claro e Escuro
explícitos já funcionam. O próximo build EAS resolve.

O caminho crítico **não** é o hardware: dá para provar a tese com dado sintético
antes de a amostra chegar.

---

## Correções técnicas — ✅ todas aplicadas

Encontradas ao revisar a SPEC, todas erros que quebram em execução. Ficam
registradas porque explicam decisões do código que de outra forma pareceriam
arbitrárias.

### 1. `biometric_readings` não vira hypertable como está — bloqueante

TimescaleDB exige que toda PK/UNIQUE inclua a coluna de particionamento. `id BIGSERIAL PRIMARY KEY` faz `create_hypertable()` falhar.

```sql
id          BIGSERIAL,
recorded_at TIMESTAMPTZ NOT NULL,
PRIMARY KEY (id, recorded_at)
```

### 2. `UNIQUE (user_id, calculated_at::date)` é sintaxe inválida — bloqueante

Constraint de tabela não aceita expressão. E `timestamptz::date` não é imutável (depende do `TimeZone` da sessão), então nem como índice passa sem fuso explícito:

```sql
CREATE UNIQUE INDEX bio_age_scores_user_day
  ON bio_age_scores (user_id, ((calculated_at AT TIME ZONE 'America/Sao_Paulo')::date));
```

### 3. Não existe tabela de usuários

Todas as tabelas referenciam `user_id UUID` mas `users` nunca é definida — e sem ela não há data de nascimento (necessária para bio age), sexo biológico (idem), consentimento nem assinatura. Faltam no mínimo: `users`, `consents`, `subscriptions`, `devices`.

`devices` não é detalhe: no modelo de assinatura com hardware incluído, o aparelho é ativo da empresa emprestado ao usuário. Precisa de número de série, data de envio, status (em uso / devolvido / perdido) e vínculo com a assinatura.

### 4. `react-native-health` é só iOS

A SPEC diz "Apple HealthKit + Google Health Connect" na mesma lib. Não são a mesma lib. Android precisa de `react-native-health-connect` — API, permissões e tipos de registro diferentes. `healthkit.service.ts` tem que ser uma interface com duas implementações por plataforma.

### 5. BLE não roda em Expo Go

`react-native-ble-plx` exige config plugin + development build (EAS). Precisa estar decidido antes do setup do app, senão retrabalho.

### 6. Expo SDK 51 está desatualizado

A SPEC foi escrita contra o SDK 51. Usar o SDK estável atual no momento do scaffold — não fixar 51.

### 7. Score de energia: falta definir a normalização

`hrv_normalizado` não é definível em escala absoluta — HRV saudável varia de ~20 ms a ~200 ms entre pessoas. O número só significa alguma coisa contra a **linha de base da própria pessoa** (média/desvio dos últimos 30 dias → percentil). E no dia 1 não existe base. Precisa ser resolvido:

- baseline pessoal em janela móvel de 30 dias, com fallback populacional por faixa etária/sexo enquanto houver < 7 dias;
- a tela precisa comunicar que está em modo "calibrando" nesse período.

Sem isso a fórmula de pesos da SPEC não produz um score comparável entre usuários nem ao longo do tempo.

### 8. Bio age: referência fixa aplicada a qualquer idade

`REF` está calibrado para 30–35 anos mas a função recebe `real_age` livre. Um usuário de 55 anos com HRV típico da idade dele é penalizado como se tivesse 32. É exatamente o que `bio_age_references.json` deveria resolver — precisa existir antes da tela, com percentis por faixa etária e sexo.

Também falta limite superior: `max(18, ...)` protege o piso, mas um dado ruim (HRV 8 ms por artefato de movimento) produz bio age absurda para cima. Sugestão: limitar `delta` a ±15 anos e descartar leitura com sinal de baixa qualidade.

### 9. LGPD desde a Fase 1, não na Fase 3

Biometria é dado pessoal **sensível** (Art. 5º II) e exige consentimento específico e destacado (Art. 11) — separado da aceitação dos termos de uso, uma finalidade por vez. Em B2C o consentimento é limpo (não tem o problema de subordinação do modelo corporativo), mas as obrigações materiais continuam.

O que precisa entrar no modelo de dados agora, porque retrofit sai caro:

- tabela `consents` com finalidade, versão do termo, data e revogação;
- revogação e exclusão de conta → rotina de exclusão real dos dados, não flag de `deleted_at`;
- política de retenção nas hypertables (Timescale faz isso nativamente);
- **transferência internacional** — Railway hospeda fora do Brasil, e dado sensível saindo do país cai no Art. 33. Precisa estar no termo de consentimento desde a primeira versão.

---

## Ciclo fisiológico em vez de dia de calendário

Do blog de engenharia do WHOOP, ["Your body doesn't know what day it
is"](https://engineering.prod.whoop.com/dev-platform-2/). É a lacuna conceitual
mais séria do nosso modelo de dados hoje, e vale registrar antes de acumular
histórico em cima da premissa errada.

**O que eles fazem:** a unidade de agregação não é o dia de calendário, é o
**ciclo** — de um início de sono ao próximo. Recovery não pertence a uma data,
pertence a um `cycle_id`. As fronteiras de ciclos passados podem ser
REAJUSTADAS retroativamente conforme o modelo aprende o ritmo da pessoa, e há
webhook (`recovery.updated`) avisando quem consome que a fronteira mudou. Quando
alguém vira a noite, eles não somam 24h ingenuamente: estimam o ritmo circadiano
individual a partir do histórico, porque — na frase deles — o circadiano sobe e
desce a cada 24h *independentemente de a pessoa ter dormido*.

**O que fazemos:** `DailyHabit` tem chave `(usuário, data)` e a agregação
contínua do Timescale recorta por `AT TIME ZONE INTERVAL '-03:00'`. Ou seja,
dia de calendário com fuso fixo do Brasil.

**O que isso quebra, em ordem de gravidade:**

1. **Quem trabalha à noite.** Dorme às 7h, acorda às 15h. O "dia" dessa pessoa
   atravessa a meia-noite, então metade da água e o sono da noite caem em datas
   diferentes — e a correlação sono × HRV do dia seguinte, que é o insight
   principal do produto, pareia as linhas erradas.
2. **Quem viaja.** O fuso é constante no código. Três dias em Lisboa e o vale
   das 14h passa a ser calculado sobre o relógio de Brasília.
3. **Quem vira a noite.** Sem sono, não há fronteira, e o dia atual nunca fecha.

O passo intermediário honesto, antes de virar ciclo de verdade: **fuso por
usuário**, coluna no cadastro em vez da constante `DEFAULT_TZ_OFFSET` em
`scoring.service.ts`. Resolve o item 2 e boa parte do 1, e não exige o modelo de
ritmo individual que o item 3 pede.

## Avaliação sistemática do insight

Do mesmo blog, ["The Crux of Every AI System:
Evaluations"](https://engineering.prod.whoop.com/ai-evaluation-framework/). O
ponto que se aplica a nós mesmo sem LLM: **eles pegaram uma regressão que
"parecia melhora" no teste manual** — a taxa de acerto subiu para 100% enquanto
a de precisão caía de 34% para 31%.

Escrevendo `models/insight.py` eu encontrei três frases falsas *olhando na mão*:
"recuperação abaixo do normal" para HRV acima da média, um pico citado depois de
ele passar, e duas horas diferentes para a mesma transição. Achei porque eram
óbvias. As próximas não vão ser.

O que dá para copiar sem LLM nenhum: um conjunto de **personas sintéticas**
(atleta em recuperação, sedentário calibrando, vespertino às 22h, noite mal
dormida, sem sensor de sono) × 24 horas, gerando ~120 insights, com asserções de
consistência que valem para TODOS eles — nenhuma hora citada no passado, nenhum
elogio a sinal abaixo da média, nenhuma frase contradizendo o `driverKey`. É
teste de propriedade, não de valor esperado, e é barato. `tests/test_insight.py`
já tem o embrião disso em `test_nunca_aponta_hora_que_ja_passou`, que varre as
24 horas.

## Decisões em aberto

Precisam de resposta antes dos marcos indicados.

| # | Decisão | Trava | Opções |
| --- | --- | --- | --- |
| 1 | `assumfit-productivity.html` existe? | M4 | Recuperar o arquivo / refazer a partir da SPEC |
| 2 | Ferramenta de monorepo | M1 | Três pastas soltas (mais simples, stacks diferentes) / npm workspaces / Turborepo |
| 3 | Onde mora a regra de negócio | M2/M3 | Toda no Python e o Node só faz proxy (recomendado) / dividida entre os dois |
| 5 | **Provedor de clima para produção** | Antes do lançamento | O Open-Meteo, usado hoje, proíbe uso comercial no plano gratuito. Ou plano pago do Open-Meteo, ou WeatherKit da Apple — este vem incluído na conta de desenvolvedor mas **exige exibir a marca "Weather" e o link de atribuição na tela**, e cobre só iOS |
| 6 | Preço da assinatura e payback | Fase 2 | Define quantos meses cada assinante precisa durar para o aparelho se pagar |
| 7 | Cobrança in-app ou por fora | Fase 2 | In-app é 15–30% da receita para a loja / web checkout preserva a margem mas piora a conversão |
| 8 | Devolução obrigatória no cancelamento? | Fase 2 | Devolve (recupera o ativo, custa frete e operação) / não devolve (simplifica, mas o aparelho vira custo perdido) |

**Resolvidas:** sexo biológico entra no cadastro (é o que permite a referência
certa de HRV e FC na idade biológica); a regra de negócio mora no Python, com o
Node fazendo proxy e persistência; e multi-tenant está fora — sem `company_id`, sem agregação entre usuários. Toda query de biometria é escopada a um único `user_id`.

---

## Marcos

Cada marco tem uma entrega verificável. Nenhum depende do hardware até o M5.

### M0 — Fundação do repositório ✅

SPEC.md, CLAUDE.md, PLANO.md, git init, .gitignore, .editorconfig.

### M1 — Contrato de dados

- DDL corrigido (itens 1, 2, 3) + `users`, `consents`, `subscriptions`, `devices`
- `docker-compose.yml` e `docker compose up -d postgres` funcionando
- Migration SQL manual para hypertable + política de retenção
- `schema.prisma` refletindo o banco
- **Seed sintético de 30 dias** para 5 perfis (matutino, vespertino, sono ruim, atleta, sedentário)

Verificável: `psql` mostra as hypertables e ~8.600 leituras por perfil.

### M2 — Modelo de IA (a parte que prova a tese hoje)

- `bio_age.py` com referências por faixa etária/sexo e clamp
- `energy_score.py` com baseline pessoal em janela móvel + fallback populacional
- `chronotype.py` sobre 7+ dias
- `circadian_prior.json`, `bio_age_references.json`
- FastAPI com os 4 endpoints da SPEC
- **pytest** rodando os 5 perfis sintéticos e provando que o cronótipo detectado bate com o perfil que gerou o dado

Verificável: `pytest` verde + curva de energia plotada por perfil.

### M3 — Backend

Auth JWT + refresh, `POST /biometric/ingest` em lote (o wearable acumula offline — ingestão tem que ser idempotente), leituras agregadas por período, proxy para o serviço de IA, APScheduler (score às 6h, bio age semanal).

### M4 — App shell 🟡 em andamento

Feito: Expo SDK 57 + RN 0.86 + TypeScript, tokens de tema, `ratings.ts` como
única porta de formatação de métrica, `bioAge.ts` com faixas por idade e sexo,
`energy.ts` com a fórmula estática da Fase 1, BLE atrás de interface com mock, e
as 11 telas (conectar, home, HRV, sono, SpO₂, temperatura, pressão, stress,
atividade, idade biológica, dispositivo).

Verificado no simulador iOS, via development build do EAS: `tsc --noEmit`
limpo, todas as telas renderizando, dados do mock circulando ao vivo, score de
energia respondendo ao horário e idade biológica somando os fatores corretamente.

Corrigidos na revisão visual: gradiente da área do gráfico saía chapado (o
`react-native-svg` ignora alfa em `rgba()` no `stopColor` — a transparência
precisa vir por `stopOpacity`), e o ícone de informação herdado do mockup
desenhava duas barras verticais, lendo como botão de "pause".

Falta: consumir o backend (depende do M3), tela de hábitos, e uma passada de
comparação lado a lado com o mockup.

**Bibliotecas fora, por escolha:** `@react-navigation/drawer` (a sidebar é
overlay próprio) e `react-native-skia` (os gráficos são SVG). Motivo e caminho
de volta em [CLAUDE.md](CLAUDE.md).

### M5 — BLE real (bloqueado pelo hardware)

O esqueleto já existe em `app/src/services/ble/staranb.ts`: ciclo de conexão,
permissões de Android, e leitura de FC, HRV (RMSSD sobre intervalos RR) e
bateria pelos serviços padrão do Bluetooth SIG — esses UUIDs são especificação,
não chute, e valem para qualquer aparelho que os implemente.

Falta, com a amostra em mãos: nRF Connect → mapear os UUIDs proprietários
(SpO₂, temperatura, PPG bruto) → escrever os parsers → apontar
`services/ble/index.ts` do mock para o `StaranbBleService` → validar HRV contra
Polar H10, alvo r > 0,85.

**Definir antes de medir:** se a correlação ficar abaixo de 0,7, o HRV vira
tendência (sem valor absoluto na tela) ou o fornecedor é reavaliado.

Se a correlação ficar abaixo de 0.7, é decisão de produto: ou o HRV só aparece como tendência (não valor absoluto), ou o fornecedor é reavaliado. Vale definir esse limiar antes de medir.

### M6 — Saúde externa

HealthKit (iOS) + Health Connect (Android) como fontes alternativas, com `source` distinguindo a origem e regra de precedência quando as duas reportam o mesmo intervalo.

---

---

## Trilha paralela — não é código, mas trava o lançamento

O time de engenharia não resolve estes, e nenhum deles cabe na última semana antes do lançamento.

### Build local do iOS está quebrado — usar EAS

`npx expo run:ios` falha dentro do **próprio SDK do Expo**, não no código do
projeto:

```
expo-modules-jsi/apple/Sources/ExpoModulesJSI/Coding/JavaScriptCodable+Date.swift:53
  type of expression is ambiguous without a type annotation
```

Expo SDK 57.0.8 contra o Swift do Xcode 26.3. **Decisão: compilar por EAS
Build**, que fixa a versão do Xcode. O primeiro build ainda não rodou — precisa
de `eas login` com a conta da Assumtek.

### ANATEL — bloqueia a distribuição do aparelho

Equipamento de radiocomunicação (o BLE conta) precisa de homologação ANATEL para ser comercializado ou distribuído no Brasil. Vale para o modelo de assinatura: emprestar o aparelho é distribuir.

Perguntar ao Staranb, já: o ANB-X1 tem certificação FCC/CE, e existe relatório de laboratório aproveitável? Homologação por similaridade encurta o processo. Prazo típico é de meses, não semanas — começar quando o app estiver pronto significa app pronto e parado.

Para 10–50 amostras de beta fechado o risco é outro (importação como amostra, sem venda), mas o relógio da homologação precisa girar em paralelo desde já.

### Lojas de aplicativo

- App Store e Play exigem política de privacidade publicada e declaração de coleta de dados de saúde.
- Dados vindos do HealthKit não podem ser usados para publicidade nem repassados a terceiros — regra da Apple, mais restritiva que a LGPD.
- Health Connect tem política equivalente no lado do Google.
- Assinatura vendida dentro do app passa pelo billing da loja.

### Consumidor

Assinatura com aparelho enviado pelo correio cai no CDC: direito de arrependimento de 7 dias na compra a distância e garantia legal do produto. Precisa de canal de suporte e fluxo de troca de aparelho com defeito — isso é operação, não só software.

---

## Fora de escopo

Qualquer visão agregada entre usuários, dashboard para terceiros, SSO corporativo ou relatório institucional. O produto expõe os dados de uma pessoa para essa pessoa e mais ninguém.

## Pendência de marca (ago/2026)

- **Imagens do banner da visão geral** — pedido de testador (Leo): imagens
- **Modos de operação (saúde / condicionamento / atleta)** — pedido do Leo (22/08/2026): cada modo mudaria metas e regras (ex.: água 50 ml/kg para alta performance, faixas de batimento, volume). Decisão de produto; exige estudo por modo antes de código.
- **Esporte + musculação no mesmo dia como dois cards** — pedido do Leo (22/08/2026): o plano tem um treino por dia; dois cards exigem dois treinos por dia no modelo (plano, check-in, semana).
- **Vídeos de exercício do MUVX no AssumFit** (pedido do Leo, 22/08/2026): é decisão de marca e licença — o material é do MUVX e o AssumFit é produto independente. Se liberado, a ligação por exercício é direta (o catálogo já tem id por exercício).
  alinhadas à identidade visual. A fundadora decidiu: "deixar anotado pra
  trocarmos as imagens depois". Escolha de marca, não de código — quando os
  assets existirem, entram em `app/assets/brand/` e o banner os consome.
