# AssuмFit — Especificação de Produto

> Versão 2.0 · Julho 2026 · Atualizada com decisões de produto e design da sessão completa.

---

## Visão geral

AssuмFit é um produto de consumo (B2C) que cruza dados biométricos reais com produtividade pessoal. A premissa central: **o corpo sabe quando você vai performar melhor — o app traduz isso em ações concretas em linguagem humana**.

Três camadas:

1. **Wearable próprio** — Staranb ANB-X1 (SDK aberto, dados PPG brutos via BLE GATT)
2. **App mobile** — leitura biométrica ao vivo + coach de produtividade + idade biológica
3. **Modelo de IA** — score de energia, cronótipo, correlações automáticas, bio age

O usuário é a pessoa física. Não há empresa contratante, gestor, RH nem visão agregada de time em nenhum ponto do produto — os dados são do usuário e só ele os vê.

---

## Modelo de negócio

**Assinatura mensal com hardware incluído** (modelo WHOOP): o usuário não compra o aparelho, ele vem junto com a assinatura. Cancelou, devolve.

Consequências que moldam o produto:

- **O aparelho é custo antecipado por assinante.** Cada nova assinatura gasta US$15–30 antes de faturar o primeiro mês. Existe um período de payback — churn antes dele é prejuízo direto, não margem menor. Retenção não é métrica de crescimento aqui, é a condição de viabilidade.
- **Cancelamento tem logística reversa.** Precisa de política de devolução, custo de frete e decisão sobre o que fazer com aparelho devolvido (recondicionar ou descartar).
- **Cobrança in-app custa 15–30% para a loja.** Com hardware já no custo, a diferença entre cobrar pelo app ou por fora é material.
- **Distribuir rádio BLE no Brasil exige homologação ANATEL.** Vale para o ANB-X1 independentemente de ser vendido ou emprestado na assinatura.

Números de preço, payback e frete ainda não estão definidos — ver [PLANO.md](PLANO.md).

---

## Stack tecnológico

### App Mobile

- **Framework:** React Native + Expo SDK 51+
- **BLE:** `react-native-ble-plx`
- **Saúde:** `react-native-health` (Apple HealthKit + Google Health Connect)
- **Navegação:** `react-navigation` v6 (Stack + Bottom Tabs)
- **Estado:** Zustand
- **HTTP:** Axios
- **Gráficos:** `react-native-skia` (canvas customizado)

### Backend

- **Runtime:** Node.js 20 + Express
- **ORM:** Prisma
- **Banco:** PostgreSQL 16 + TimescaleDB
- **Auth:** JWT + refresh tokens
- **Calendário:** Google Calendar API + Microsoft Graph (Outlook)

### Modelo de IA

- **Linguagem:** Python 3.12
- **API:** FastAPI
- **Libs:** pandas, numpy, scikit-learn, scipy
- **Scheduler:** APScheduler (recalcula score às 6h e bio age semanalmente)

### Infra

- **Local:** Docker Compose
- **CI:** GitHub Actions
- **Deploy:** Railway (backend + Python) + Expo EAS (builds mobile)

---

## Hardware — Staranb ANB-X1

### Sensores

| Sensor           | Dado             | Frequência                     |
| ---------------- | ---------------- | ------------------------------ |
| PPG (MAX86141)   | FC, HRV, SpO₂    | A cada 5 min (contínuo disponível) |
| Acelerômetro 6 eixos | Passos, atividade, sono | Contínuo                  |
| NTC              | Temperatura de pele | A cada 10 min               |
| Chip             | Nordic NRF54L15  | —                              |

### Vantagens sobre Big 4

- **SDK aberto com dados PPG brutos** — único do mercado (WHOOP, Apple, Samsung, Garmin só expõem dados processados)
- **Bateria 45–50 dias** — supera WHOOP MG (14 dias) e todos os smartwatches
- **Custo ~US$15–30/unidade** atacado — 20× mais barato que WHOOP
- **White-label confirmado** — hardware com logo AssuмFit

### Gap vs. concorrentes

- Sem ECG certificado (FDA) — não é bloqueio para o produto de produtividade
- Resistência 1ATM (vs. 10ATM dos smartwatches) — uso em escritório e academia, não natação
- Precisão do HRV precisa ser validada contra Polar H10 ao receber o hardware

### Primeira ação ao receber

```
1. Instalar nRF Connect (iOS/Android)
2. Parear com o relógio
3. Mapear os UUIDs dos serviços BLE
4. Validar HRV vs. Polar H10 em repouso (correlação alvo: > 0.85)
5. Começar pelo ble.service.ts
```

---

## Integrações de saúde externas

Usuário com Apple Watch, Garmin ou Samsung alimenta o mesmo modelo automaticamente.

### Apple HealthKit (iOS)

```js
import AppleHealthKit from 'react-native-health';

const permissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.HeartRateVariability,
      AppleHealthKit.Constants.Permissions.HeartRate,
      AppleHealthKit.Constants.Permissions.SleepAnalysis,
      AppleHealthKit.Constants.Permissions.OxygenSaturation,
      AppleHealthKit.Constants.Permissions.BodyTemperature,
      AppleHealthKit.Constants.Permissions.StepCount,
    ],
  },
};
```

### Google Health Connect (Android)

```kotlin
val client = HealthConnectClient.getOrCreate(context)
val response = client.readRecords(
  ReadRecordsRequest(
    HeartRateVariabilityRmssdRecord::class,
    timeRangeFilter = TimeRangeFilter.between(yesterday, now)
  )
)
```

### Wearables com SDK (fase 2)

- Garmin Connect IQ — HRV, Body Battery, stress, sono
- Fitbit / Google SDK — OAuth + Web API
- Samsung Health SDK — stress via BioActive Sensor
- Polar AccessLink — REST API, referência clínica de HRV

---

## Modelo de energia (IA)

### Como aprende

**Dia 1 — Prior científico (cronobiologia):**

- Temperatura sobe ao longo da manhã, pico 12h–14h → melhor performance física
- Vale de alerta 13h–15h → reuniões, revisões, tarefas leves
- Segundo pico 16h–18h → criatividade, brainstorm

**Com o tempo:**

- 7 dias → cronótipo identificado (matutino / vespertino)
- 14 dias → padrões semanais mapeados
- 30 dias → previsões com alta precisão individual

### Fórmula do score de energia

```python
def calcular_score(hrv_normalizado, fc_repouso_invertida,
                   qualidade_sono, hidratacao, temperatura_norm):
    return round((
        hrv_normalizado      * 0.40 +  # preditor mais forte
        fc_repouso_invertida * 0.20 +  # FC alta = score baixo
        qualidade_sono       * 0.25 +
        hidratacao           * 0.10 +
        temperatura_norm     * 0.05
    ) * 100, 1)
```

### Sinais e pesos

| Sinal            | Peso | Por que importa                                      |
| ---------------- | ---- | ---------------------------------------------------- |
| HRV manhã        | 40%  | Preditor mais forte de energia cognitiva do dia      |
| Qualidade sono   | 25%  | REM e profundo definem pico do dia seguinte         |
| FC repouso       | 20%  | FC alta = sistema nervoso sob estresse              |
| Hidratação       | 10%  | 1% de desidratação reduz concentração em 12%        |
| Temperatura      | 5%   | Pico de temperatura = pico de performance física    |

---

## Modelo de idade biológica

### Conceito

Compara métricas fisiológicas do usuário com curvas de referência de populações saudáveis por faixa etária. Se os dados são melhores que a média de alguém mais novo, a idade biológica é menor.

**Diferencial vs. WHOOP Age:** WHOOP mostra o número. AssuмFit mostra o número + o fator que está puxando + a ação concreta para melhorar.

### Cálculo

```python
REF = {
    'hrv':  {'p10': 38, 'p50': 54, 'p90': 74},  # ms, 30-35 anos
    'hr':   {'p10': 52, 'p50': 68, 'p90': 82},  # bpm repouso
    'spo2': {'p50': 96, 'p90': 98},              # %
}

def calc_bio_age(real_age, hrv, hr, spo2, sleep_deep_pct):
    d_hrv   = ((hrv - REF['hrv']['p50'])  / (REF['hrv']['p90']  - REF['hrv']['p50']))  * 4.0
    d_hr    = ((REF['hr']['p50'] - hr)    / (REF['hr']['p50']   - REF['hr']['p10']))   * 2.5
    d_spo2  = ((spo2 - REF['spo2']['p50'])/ (REF['spo2']['p90'] - REF['spo2']['p50'])) * 0.8
    d_sleep = ((sleep_deep_pct - 0.20) / 0.25) * 2.5  # 20% é média; 45% seria +2.5
    delta   = d_hrv + d_hr + d_spo2 + d_sleep
    return max(18, round(real_age - delta))
```

### O que a tela mostra

1. **Número** — idade biológica vs. real com delta em anos e cor (verde/âmbar/vermelho)
2. **Breakdown por fator** — contribuição de cada métrica em anos (ex: HRV −3,2a, sono −2,1a)
3. **Ação principal** — a mudança de hábito que mais impacta, baseada nos dados do usuário
4. **Tendência 30 dias** — sparkline mostrando evolução da bio age ao longo do mês
5. **Disclaimer** — não é diagnóstico médico, é indicador de tendência cardiovascular

---

## Banco de dados

```sql
-- Leituras brutas do wearable (TimescaleDB hypertable)
CREATE TABLE biometric_readings (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  hrv_ms      FLOAT,
  heart_rate  INT,
  spo2_pct    FLOAT,
  temperature FLOAT,
  steps       INT,
  bp_systolic INT,
  bp_diastolic INT,
  stress_score FLOAT,
  resp_rate   FLOAT,
  source      TEXT DEFAULT 'staranb'
);
SELECT create_hypertable('biometric_readings', 'recorded_at');

-- Score de energia calculado por hora
CREATE TABLE energy_scores (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL,
  hour_start  TIMESTAMPTZ NOT NULL,
  score       FLOAT NOT NULL,
  hrv_used    FLOAT,
  sleep_used  FLOAT,
  UNIQUE (user_id, hour_start)
);

-- Idade biológica (calculada semanalmente)
CREATE TABLE bio_age_scores (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL,
  real_age    INT NOT NULL,
  bio_age     INT NOT NULL,
  delta       INT NOT NULL,
  d_hrv       FLOAT,
  d_hr        FLOAT,
  d_spo2      FLOAT,
  d_sleep     FLOAT,
  UNIQUE (user_id, calculated_at::date)
);

-- Sessões de produtividade
CREATE TABLE productivity_sessions (
  id                     BIGSERIAL PRIMARY KEY,
  user_id                UUID NOT NULL,
  type                   TEXT NOT NULL,
  started_at             TIMESTAMPTZ NOT NULL,
  ended_at               TIMESTAMPTZ,
  duration_min           INT,
  energy_score_at_start  FLOAT
);

-- Hábitos diários
CREATE TABLE daily_habits (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL,
  date           DATE NOT NULL,
  water_ml       INT DEFAULT 0,
  sleep_score    FLOAT,
  focus_sessions INT DEFAULT 0,
  UNIQUE (user_id, date)
);
```

> Correções obrigatórias antes de rodar este DDL: ver [PLANO.md](PLANO.md) § "Correções técnicas".

---

## Telas do app (implementadas no mockup)

### App de leitura biométrica (`assumfit-app.html`)

| Tela                    | Conteúdo                                                        | Status     |
| ----------------------- | --------------------------------------------------------------- | ---------- |
| Conectar                | Scanning BLE, lista de dispositivos, RSSI                       | ✅ mockup  |
| Início (home)           | Grid 2×2 de blocos, card de estado, check de humor              | ✅ mockup  |
| Recuperação (HRV)       | Big number, gráfico canvas ao vivo, tabs 1H/6H/24H/7D, stats    | ✅ mockup  |
| Sono                    | Ring chart, barra de fases, breakdown REM/profundo/leve         | ✅ mockup  |
| Oxigênio (SpO₂)         | Arc gauge colorido, thumb no range clínico, histórico           | ✅ mockup  |
| Temperatura             | Gauge, escala 35–39 °C, histórico do dia, insight circadiano    | ✅ mockup  |
| Pressão arterial        | Big numbers sistólica/diastólica, tabela de zonas com "você aqui" | ✅ mockup |
| Stress                  | Arc gauge, gráfico de barras por hora coloridas por nível       | ✅ mockup  |
| Atividade               | Anel de passos, distância, calorias, minutos ativos             | ✅ mockup  |
| **Idade biológica**     | Bio age vs. real, breakdown por fator, ação principal, tendência 30d | ✅ mockup |

**Sidebar (menu hamburguer):** acesso a todas as telas com valores ao vivo e badges de avaliação.

### App de produtividade (`assumfit-productivity.html`)

| Tela     | Conteúdo                                                                |
| -------- | ----------------------------------------------------------------------- |
| Hoje     | Card hero de ação, linha do tempo do dia, check de humor                |
| Energia  | Arc gauge 0–100, barras por hora, blocos do dia com justificativa       |
| Hábitos  | Tracker de água, anéis de progresso, correlações descobertas            |
| Padrões  | Gráfico semanal energia × HRV, correlações automáticas, ranking de horários |

---

## Design system — minimalismo clínico

> Substitui a paleta multicolorida das versões anteriores. Linhagem:
> Rams/Braun → Muji → Apple → Aesop → DTC (Oura, Ritual). Vocabulário de
> instrumento de medição, não de app de consumo.

### Paleta — do manual de marca

As três cores base vêm do **Manual de Marca AssumFit**, não foram escolhidas no
código. O kit completo está em [`app/assets/brand/`](app/assets/brand/), com o
manual em PDF, os SVG de símbolo e logotipo e as aplicações.

| Token            | Valor                      | Origem / uso                            |
| ---------------- | -------------------------- | --------------------------------------- |
| `ink`            | `#0E0A22`                  | Manual. Fundo — quase-preto com viés roxo |
| `text`           | `#ECE7F4`                  | Manual. Off-white levemente lilás       |
| `accent`         | `#877BF0`                  | Manual. **Só o dado.** Nunca texto, botão ou nav |
| `textMuted`      | `rgba(236,231,244,.56)`    | Corpo, descrições                       |
| `textFaint`      | `rgba(236,231,244,.36)`    | Rótulos, unidades, dados secundários    |
| `hairline`       | `rgba(236,231,244,.10)`    | Divisórias                              |
| `track`          | `rgba(236,231,244,.09)`    | Trilho de anéis, arcos e réguas         |
| `alert`          | `#D08A62`                  | **Não está no manual** — a identidade não previa cor de alerta, e um app de saúde precisa de uma. Só fora da faixa saudável |

Nenhum tom além do `alert` foi inventado. Se algum divergir do manual, o manual
ganha.

### Marca

Símbolo e logotipo são **vetores oficiais**, gerados a partir dos SVG do kit em
`app/src/components/Logo.tsx`. Regras que decorrem disso:

- O logotipo é **desenhado, não texto**. A identidade usa uma sans geométrica
  que não está instalada no app; renderizar "assumfit" com a fonte do sistema
  produziria outro desenho de letra.
- No logotipo, **só o pingo do "i" é roxo** — não a sílaba "fit".
- O símbolo tem simetria rotacional, o que o torna adequado a animação de giro:
  em qualquer ângulo a composição segue equilibrada.
- Se a marca mudar, **regerar** o componente a partir do SVG novo. Não editar
  path à mão.

**Um acento, e ele pertence ao dado.** Saturação alta aparece exclusivamente na
visualização — ela é merecida. Navegação, rótulo, botão e ícone são acromáticos.

**Alert é reservado.** Aparece quando o valor sai da faixa saudável de verdade,
nunca para graduar o que está bem: "Bom" e "Excelente" têm a mesma cor. Neutro
até ser anormal, como instrumento.

### Tipografia

- **Contraste por escala, não por peso.** Não existe weight 700 no sistema.
- Pesos 200 (números grandes), 300 (títulos e avaliações), 400 (corpo).
- Títulos grandes com tracking negativo; **rótulos em caixa alta com tracking
  largo** (1,6px), como etiqueta de amostra de laboratório.
- Todo número é `tabular-nums`. Dígito que dança destrói a leitura de medição.

### Linha, espaço e forma

- **A linha substitui a caixa.** Não existe card com borda — existe divisória
  hairline. Se algo ganhar fundo e borda nos quatro lados, o sistema regrediu.
- Hairlines sempre em opacidade baixa, nunca cinza sólido.
- Ícones **monolineares outline**, traço 1,5px constante, cantos arredondados,
  desenhados em grid de 24×24. Glifo preenchido não entra.
- Escala de espaçamento em múltiplos de 4. Margem lateral de 24.
- **Alinhamento à esquerda e assimetria**, não centralização. Conteúdo que não
  preenche a tela — espaço negativo é o sinal de preço.

### Relevo e material

O sistema não é chapado. O relevo vem de **material**, nunca de sombra
projetada — a peça deve parecer ter espessura sob luz difusa, não flutuar sobre
uma mesa. Na prática: translucidez, aresta clara no topo e escura no rodapé,
divisória em baixo-relevo.

**Vidro pertence à camada de controle; conteúdo é plano.** Barra de abas,
painel lateral, ação flutuante e modal usam Liquid Glass
(`expo-glass-effect`, iOS 26, com fallback translúcido). Métrica, lista e
gráfico usam superfície discreta ou nada. É a mesma regra que a Apple aplica ao
próprio material — vidro em tudo vira decoração e derruba a contenção.

Fora deste sistema: `shadowColor` colorido, `elevation` alta, borda desenhada
nos quatro lados, gradiente decorativo.

### Dataviz como ornamento

Não há ilustração, padronagem nem grafismo decorativo neste produto. O gráfico
é o ornamento: anéis finos, arcos finos, sparklines, réguas. Monocromáticos —
gradiente vermelho→verde é leitura de semáforo, não de instrumento.

### Regra de ouro

Qualquer número técnico (HRV em ms, SpO₂ em %) aparece como sub-label. O
destaque é sempre a avaliação em linguagem humana. Implementada em
`app/src/domain/ratings.ts`, que é a única porta de saída de métrica do app.

---

## Estrutura de pastas (monorepo)

```
assumfit/
├── app/                              # React Native (Expo)
│   ├── src/
│   │   ├── screens/
│   │   │   ├── ConnectScreen.tsx
│   │   │   ├── HomeScreen.tsx        # Grid 2×2 + state card + humor
│   │   │   ├── HRVScreen.tsx         # Recuperação + gráfico ao vivo
│   │   │   ├── SleepScreen.tsx
│   │   │   ├── OxygenScreen.tsx      # SpO₂
│   │   │   ├── TemperatureScreen.tsx
│   │   │   ├── PressureScreen.tsx    # BP tendências
│   │   │   ├── StressScreen.tsx
│   │   │   ├── ActivityScreen.tsx    # Passos + atividade
│   │   │   ├── BioAgeScreen.tsx      # Idade biológica ← novo
│   │   │   ├── EnergyScreen.tsx      # App produtividade
│   │   │   ├── HabitsScreen.tsx
│   │   │   └── InsightsScreen.tsx
│   │   ├── components/
│   │   │   ├── Sidebar.tsx           # Menu hamburguer com todas as métricas
│   │   │   ├── MetricBlock.tsx       # Bloco 2×2 com anel + avaliação
│   │   │   ├── HRVCanvas.tsx         # Gráfico ao vivo
│   │   │   ├── EnergyArc.tsx
│   │   │   ├── BioAgeBreakdown.tsx   # Tabela de fatores
│   │   │   ├── WaterTracker.tsx
│   │   │   ├── TimelineDay.tsx
│   │   │   └── ActionHero.tsx
│   │   ├── services/
│   │   │   ├── ble.service.ts        # Staranb BLE GATT
│   │   │   ├── healthkit.service.ts  # Apple Health / Health Connect
│   │   │   ├── calendar.service.ts   # Google + Outlook
│   │   │   └── api.service.ts        # Backend HTTP
│   │   ├── store/
│   │   │   ├── biometric.store.ts    # HRV, FC, SpO₂, temp, BP, stress
│   │   │   ├── bioage.store.ts       # Idade biológica + histórico
│   │   │   ├── habits.store.ts
│   │   │   └── user.store.ts
│   │   └── theme/
│   │       ├── colors.ts             # Design system tokens
│   │       └── typography.ts
│   └── package.json
│
├── backend/                          # Node.js + Express
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── biometric.routes.ts
│   │   │   ├── energy.routes.ts
│   │   │   ├── bioage.routes.ts      # ← novo
│   │   │   └── habits.routes.ts
│   │   ├── services/
│   │   │   ├── energy.service.ts     # Chama modelo Python
│   │   │   ├── bioage.service.ts     # Chama modelo Python ← novo
│   │   │   └── calendar.service.ts
│   │   └── prisma/schema.prisma
│   └── package.json
│
├── ai/                               # Python + FastAPI
│   ├── main.py
│   ├── models/
│   │   ├── energy_score.py           # Score 0–100 por hora
│   │   ├── chronotype.py             # Matutino / vespertino
│   │   ├── bio_age.py                # Idade biológica ← novo
│   │   └── correlations.py           # Insights automáticos
│   ├── data/
│   │   ├── circadian_prior.json      # Prior científico de cronobiologia
│   │   └── bio_age_references.json   # Curvas de referência por faixa etária ← novo
│   └── requirements.txt
│
└── docker-compose.yml
```

---

## Docker Compose (local)

```yaml
version: '3.8'
services:
  postgres:
    image: timescale/timescaledb:latest-pg16
    environment:
      POSTGRES_DB: assumfit
      POSTGRES_USER: assumfit
      POSTGRES_PASSWORD: assumfit_dev
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgresql://assumfit:assumfit_dev@postgres:5432/assumfit
      JWT_SECRET: dev_secret_change_in_prod
      AI_SERVICE_URL: http://ai:8000
    depends_on:
      - postgres

  ai:
    build: ./ai
    ports:
      - "8000:8000"
    depends_on:
      - postgres

volumes:
  pg_data:
```

---

## FastAPI — endpoints principais

```python
# ai/main.py
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class BiometricInput(BaseModel):
    user_id: str
    hrv_ms: float
    sleep_score: float
    sleep_deep_pct: float = 0.20
    resting_hr: int
    spo2_avg: float = 97.0
    water_ml: int = 0

@app.post("/energy/score-diario")
async def score_diario(data: BiometricInput):
    cronotipo = identificar_cronotipo(data.user_id)
    curva = calcular_curva_dia(
        hrv_manha=data.hrv_ms,
        qualidade_sono=data.sleep_score,
        fc_repouso=data.resting_hr,
        cronotipo=cronotipo
    )
    return {"user_id": data.user_id, "curva": curva, "cronotipo": cronotipo}

@app.post("/bioage/calcular")
async def calcular_bio_age(data: BiometricInput):
    """Calcula e persiste a idade biológica do usuário."""
    result = calc_bio_age(
        real_age=get_user_age(data.user_id),
        hrv=data.hrv_ms,
        hr=data.resting_hr,
        spo2=data.spo2_avg,
        sleep_deep_pct=data.sleep_deep_pct
    )
    persist_bio_age(data.user_id, result)
    return result

@app.get("/bioage/historico/{user_id}")
async def historico_bio_age(user_id: str, dias: int = 30):
    """Retorna tendência de bio age para o sparkline."""
    return get_bio_age_history(user_id, dias)

@app.get("/insights/{user_id}")
async def insights(user_id: str, dias: int = 14):
    return gerar_insights(user_id, dias)
```

---

## Variáveis de ambiente

```env
# backend/.env
DATABASE_URL=postgresql://assumfit:assumfit_dev@localhost:5432/assumfit
JWT_SECRET=
JWT_EXPIRES_IN=7d
AI_SERVICE_URL=http://localhost:8000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# app/.env
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_AI_URL=http://localhost:8000
```

---

## APIs externas necessárias

| Serviço              | Para que                            | Onde configurar          |
| -------------------- | ----------------------------------- | ------------------------ |
| Google Calendar API  | Leitura de eventos, bloqueio de agenda | console.cloud.google.com |
| Microsoft Graph      | Outlook + Teams Calendar            | portal.azure.com         |
| Apple HealthKit      | Dados de saúde iOS                  | Xcode → Capabilities     |
| Google Health Connect| Dados de saúde Android              | Google Play Console      |

---

## Checklist — primeiro dia de desenvolvimento

```bash
# 1. Criar repo e estrutura
mkdir assumfit && cd assumfit
git init
mkdir app backend ai

# 2. App React Native
cd app
npx create-expo-app . --template blank-typescript
npx expo install \
  react-native-ble-plx \
  react-native-health \
  @react-navigation/native \
  @react-navigation/bottom-tabs \
  react-native-screens \
  react-native-safe-area-context \
  zustand axios

# 3. Backend Node.js
cd ../backend
npm init -y
npm install express prisma @prisma/client typescript \
  ts-node-dev jsonwebtoken dotenv axios cors
npx prisma init

# 4. Serviço Python
cd ../ai
python -m venv venv && source venv/bin/activate
pip install fastapi uvicorn pandas numpy scikit-learn \
  scipy python-dotenv psycopg2-binary apscheduler

# 5. Banco local
cd ..
docker compose up -d postgres

# 6. Ao receber o Staranb:
#    → Instalar nRF Connect no celular
#    → Parear com o relógio
#    → Anotar os UUIDs dos serviços BLE
#    → Validar HRV vs. Polar H10 (correlação alvo > 0.85)
#    → Começar pelo ble.service.ts
```

---

## Roadmap

### Fase 1 — MVP (meses 1–3)

Validar com 10–50 beta testers.

- [ ] Setup monorepo e Docker Compose
- [ ] Integração BLE Staranb (após mapear UUIDs com nRF Connect)
- [ ] Telas biométricas: HRV ao vivo, sono, SpO₂, temperatura, pressão, stress, atividade
- [ ] Backend: ingestão de dados BLE → TimescaleDB
- [ ] Gráfico de HRV ao vivo (canvas customizado)
- [ ] Apple HealthKit + Google Health Connect
- [ ] Score de energia básico (fórmula estática)
- [ ] Sidebar com todas as métricas
- [ ] Tela de idade biológica (cálculo local, sem modelo treinado)

### Fase 2 — Lançamento nas lojas (meses 4–6)

Abrir para o público.

- [ ] Modelo Python de score de energia (FastAPI)
- [ ] Cronótipo individual (7+ dias de dados)
- [ ] Linha do tempo do dia gerada por IA
- [ ] Google Calendar API + Microsoft Graph
- [ ] Labels de energia nos eventos da agenda
- [ ] Idade biológica com curvas de referência reais e persistência
- [ ] Tracker de água e hábitos com persistência
- [ ] Notificações inteligentes (água, pausa, horário de dormir)
- [ ] Correlações automáticas no app de produtividade
- [ ] Assinatura: cobrança recorrente, cancelamento, período de teste
- [ ] Onboarding com termo de consentimento LGPD e política de privacidade
- [ ] Homologação ANATEL do ANB-X1 — **bloqueia a distribuição, começar cedo**
- [ ] Fluxo de devolução do aparelho no cancelamento

### Fase 3 — Escala (meses 7–12)

Crescer a base e segurar a retenção.

- [ ] Coach conversacional — perguntar sobre os próprios dados em linguagem natural
- [ ] Relatório semanal e retrospectiva mensal (motor de reengajamento)
- [ ] Plano anual e plano família
- [ ] Programa de indicação
- [ ] Portal de privacidade: exportar dados, revogar consentimento, excluir conta
- [ ] Hardware white-label com logo próprio
- [ ] Recondicionamento dos aparelhos devolvidos

---

## Referências de design

Protótipos interativos — usar como referência fiel para o React Native:

- [`mockups/assumfit-app.html`](mockups/assumfit-app.html) — app de leitura biométrica com sidebar e todas as 9 telas de saúde + bio age
- `mockups/assumfit-productivity.html` — app de produtividade com coach de ações _(pendente)_

**Regra de ouro do design:** qualquer número técnico (HRV em ms, SpO₂ em %) aparece como sub-label. O destaque visual é sempre a avaliação em linguagem humana (Excelente, Bom, Pode melhorar).

---

## Fornecedor do hardware

**Shenzhen Staranb Communication Technology Co., Ltd.**

- Plataforma: made-in-china.com
- Produto: Custom SDK Screenless Fitness Tracker GPS ANB-X1
- Chip: Nordic NRF54L15
- SDK: confirmado (BLE GATT + protocolo de dados PPG brutos)
- White-label: confirmado
- MOQ amostras: 2–10 unidades
- Contato: silvia.souza@assumtek.com.br
- Status: **amostra a caminho**

---

_Versão 2.0 — Julho 2026. Atualizar conforme o desenvolvimento avança._
