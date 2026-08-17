# AssuмFit — guia do projeto

Produto de consumo (B2C): wearable próprio (Staranb ANB-X1) → biometria ao vivo → score de energia, cronótipo e idade biológica. Assinatura mensal com o aparelho incluído.

O usuário é a pessoa física e só ele vê os próprios dados. **Não existe empresa, gestor, RH nem visão de time em lugar nenhum** — se um requisito pedir agregação entre usuários, é sinal de que algo se perdeu na tradução.

- Especificação completa do produto: [SPEC.md](SPEC.md)
- Plano de execução e decisões em aberto: [PLANO.md](PLANO.md)
- Idioma do projeto: **português (pt-BR)** em UI, docs, commits e comentários. Identificadores de código em inglês.

## Estrutura

Monorepo de três serviços (ver árvore completa em [SPEC.md](SPEC.md)):

- `app/` — React Native + Expo (TypeScript)
- `backend/` — Node.js 20 + Express + Prisma
- `ai/` — Python 3.12 + FastAPI (score de energia, cronótipo, bio age)

## Comandos

```bash
docker compose up -d postgres            # banco local (TimescaleDB pg16)
cd backend && npm run dev                # API em :3001
cd backend && npm run seed               # 5 perfis, 30 dias, ~42 mil leituras
cd ai && ./venv/bin/uvicorn main:app --reload   # modelo em :8000
cd app && npx expo start --port 8090     # 8081 costuma estar ocupada por outro projeto
```

Verificação (rodar antes de qualquer PR):

```bash
cd app && npx tsc --noEmit && npx jest   # 179 testes
cd backend && npx tsc --noEmit && npx jest     # 38 testes
cd ai && ./venv/bin/python -m pytest tests -q   # 1987 testes (personas × 24h)
```

**Python 3.11 no venv local**, não 3.12: o 3.14 desta máquina não tem wheel para
numpy/scipy nas versões fixadas e tenta compilar do zero. O Docker usa 3.12.

## A matemática existe em dois lugares

Score de energia e idade biológica estão em `app/src/domain/` (TypeScript, para
funcionar offline) e em `ai/models/` (Python, fonte da verdade). É duplicação
deliberada, e o que impede as duas de divergirem em silêncio é
`ai/tests/test_models.py::TestParidadeComTypeScript`, que roda a implementação
do app pelos mesmos casos e compara. **Mexeu numa, rode esse teste.**

## Como o app é construído

**Expo com prebuild (CNG) + EAS Build. Não usamos Expo Go.**

`ios/` e `android/` são gerados por `expo prebuild` e ficam no `.gitignore` — a
fonte da verdade é o `app.json`. Nunca edite o projeto nativo à mão: o próximo
prebuild descarta. Permissão nova vai em `app.json`, via `infoPlist`,
`android.permissions` ou config plugin.

```bash
eas build --profile development --platform ios   # dev client p/ simulador
eas build:run -p ios --latest                    # instala o build no simulador
npx expo start --dev-client --port 8090
```

Projeto EAS: `@assumtek/assumfit`. O dev client só precisa ser reconstruído
quando muda dependência nativa ou `app.json` — mudança de JS chega por Metro.

### Deep links

Toda tela tem rota (`assumfit://bioage`, `assumfit://hrv`, `assumfit://sono`,
`assumfit://perfil`,
`assumfit://configuracoes`…), declaradas em `navigation/index.tsx`. Servem para
notificação abrir a tela certa e, no desenvolvimento, para pular direto:

```bash
xcrun simctl openurl booted "assumfit://bioage"
```

Para conferir o tema claro sem tocar na tela, troque a aparência do simulador —
funciona só depois do rebuild com `userInterfaceStyle: "automatic"`:

```bash
xcrun simctl ui booted appearance light
```

### Verificar Swift sem gastar um build de EAS

Compilar localmente **funciona**, e é o único jeito de ver erro de Swift com
número de linha. Sem isso, cada erro custa ~15 minutos de EAS e vem sem linha —
foi assim que um método deletado por engano virou três rodadas perdidas.

```bash
npx expo prebuild -p ios                 # gera ios/ e roda pod install
cd ios && xcodebuild -workspace AssumFit.xcworkspace -scheme AssumFit \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

**Para rodar no SIMULADOR, a receita é outra em dois pontos.**
`CODE_SIGNING_ALLOWED=NO` serve para checar se o Swift compila, mas o app
resultante não acessa o Keychain — o SecureStore falha, o login morre, e a tela
mostra "Sem conexão com o servidor" com o backend de pé. Simulador usa
assinatura ad-hoc (grátis, sem certificado): `CODE_SIGN_IDENTITY=-`. E o
`.env` aponta a API para o IP da LAN, que o app do simulador não alcança —
suba o Metro com `EXPO_PUBLIC_API_URL=http://localhost:3001` e `--clear`
(o cache de transform congela o valor antigo do env).

```bash
cd ios && xcodebuild -workspace AssumFit.xcworkspace -scheme AssumFit \
  -destination 'generic/platform=iOS Simulator' CODE_SIGN_IDENTITY=- build
```

Para INSTALAR no aparelho, sem passar pelo EAS — assinatura é obrigatória aqui,
e `prebuild` apaga a equipe do projeto toda vez, então ela vai na linha:

```bash
cd ios && xcodebuild -workspace AssumFit.xcworkspace -scheme AssumFit \
  -destination 'generic/platform=iOS' -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=5695J86AVD build
xcrun devicectl device install app --device <id> \
  ~/Library/Developer/Xcode/DerivedData/AssumFit-*/Build/Products/Debug-iphoneos/AssumFit.app
```

`npx expo run:ios --device` também compila e assina, mas a etapa de instalação
falha com `error reading pair record for device`; o `devicectl` da Apple
conversa com o aparelho sem isso.

`CODE_SIGNING_ALLOWED=NO` é o que dispensa certificado: para saber se o Swift
está correto, assinatura é irrelevante — e é justamente a parte que exige o
Apple Developer. O alvo tem que ser aparelho, não simulador, porque o
`QCBandSDK.framework` é arm64 puro.

Para iterar num módulo só, ~17 segundos por rodada em vez do build inteiro:

```bash
cd ios && xcodebuild -project Pods/Pods.xcodeproj -target QCBand \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

O EAS continua necessário para gerar o `.ipa` assinado. O que ele deixou de ser
é o lugar onde se descobre se o código compila.

**O que destravou isso** está em `patches/expo-modules-jsi+57.0.4.patch`, e é um
token: `abs` → `Swift.abs`. O pacote compila com
`-cxx-interoperability-mode=default`, e aí as sobrecargas de `abs` do `<cstdlib>`
entram no escopo e colidem com a genérica do Swift. Só o Xcode 26.3 acusa; o do
EAS não, e por isso o bug ficou anos registrado aqui como "não funciona". O
`postinstall` roda `patch-package` — sem ele, o próximo `npm install` desfaz.

**Depois de qualquer `npm install` que recrie o `node_modules`, confira o
embed do JSI antes de buildar.** O `pod install` decide o que embarcar olhando
o xcframework NO MOMENTO em que roda; se o binário ainda era o stub, o
`Pods-AssumFit-frameworks.sh` sai sem `ExpoModulesJSI`, o build "SUCCEEDED"
e o app morre na abertura com `dyld: Library not loaded`. A conferência é:

```bash
grep -c ExpoModulesJSI "ios/Pods/Target Support Files/Pods-AssumFit/Pods-AssumFit-frameworks.sh"
# 0 → rode pod install de novo (com o binário já construído) antes de buildar
```

**Um build "concluído" do EAS pode entregar um `.ipa` quebrado.** O script que
constrói o xcframework do `expo-modules-jsi` falha em SILÊNCIO: o alvo não
produz nada, o framework não é embarcado, e o build é marcado como concluído. O
app morre na abertura com `DYLD: Library not loaded` e o Metro nunca vê nada —
não há erro em lugar nenhum que aponte para isso.

Foi o que o patch do `abs` acima corrige, e é a razão de ele importar muito além
do build local. Antes de instalar, confira o artefato:

```bash
npx eas-cli build:view <id> --json | python3 -c "import json,sys; print(json.load(sys.stdin)['artifacts']['buildUrl'])"
curl -sL -o app.ipa "<url>" && unzip -q app.ipa -d ipa
ls ipa/Payload/*.app/Frameworks    # precisa ter 9, incluindo ExpoModulesJSI.framework
```

**`ios/build/` não é descartável.** O nome engana: ele guarda os fontes que o
codegen do React Native gera durante o `pod install`. Apagar quebra o build com
"Build input file cannot be found", que parece corrupção de projeto. Cache de
verdade é `~/Library/Developer/Xcode/DerivedData`.

### Build de LOJA sem a cota do EAS (jul/2026, funcionou de ponta a ponta)

Com a cota de iOS do plano Free esgotada, o `.ipa` de App Store sai desta
máquina. O que NÃO funciona, e por quê, para ninguém repetir o caminho:

- `eas build --local -p ios` — falha na assinatura: o certificado de
  distribuição guardado no EAS é do tipo LEGADO ("iPhone Distribution"), e o
  keychain de login desta máquina tem um "Apple Distribution" moderno que o
  Xcode prefere; o perfil não o contém e o build morre com "profile doesn't
  include signing certificate".
- `xcodebuild -exportArchive` com assinatura automática — "Cloud signing
  permission error": a chave ASC (`~/.credenciais/assumfit/`) não tem papel de
  Admin.
- Export com assinatura MANUAL e perfis instalados — o gerenciador de perfis
  do Xcode 26 APAGA perfis desconhecidos de
  `~/Library/Developer/Xcode/UserData/Provisioning Profiles` no meio do
  próprio exportArchive; o do widget some antes de ser lido.

O que funciona: archive com a chave ASC (`-allowProvisioningUpdates` +
`-authenticationKey*`, que para ARCHIVE bastam) e depois **re-assinatura
manual** do `.app`, estilo `fastlane sigh resign` — perfis de App Store
embutidos nos bundles (app e `PlugIns/Treino.appex`), entitlements extraídos
do PRÓPRIO perfil (menos `healthkit.access`, que o app não usa), keychain
temporário com senha conhecida (sem prompt de GUI), `codesign` de dentro para
fora (Frameworks → appex → app) e zip do `Payload/`. Perfis e p12 (com senha)
saem do JSON de job de qualquer build do EAS (`logFiles` decodifica com
**brotli**, não gzip). Upload por `eas submit -p ios --path <ipa>` — submit
não tem cota; o `ascAppId` já está no `eas.json`. Conferir o artefato antes:
Frameworks com `ExpoModulesJSI` e `grep api.assumfit.com.br` no `main.jsbundle`
(o env de produção entra no ARCHIVE via `EXPO_PUBLIC_API_URL=...` na linha do
xcodebuild).

### O caminho que funcionou em ago/2026 (versão 1.0.1, build 13)

A cota de iOS do EAS renovou e o build na nuvem **rodou** — e ainda assim o
`.ipa` dele saiu QUEBRADO, pela mesma falha silenciosa de sempre: 12
frameworks, sem `ExpoModulesJSI`, com o binário carregando
`@rpath/ExpoModulesJSI.framework`. Conferir o artefato antes de submeter não é
zelo excessivo; é o que separou um envio bom de um app que morre na abertura.

O que funciona é o **archive local** (que embarca os 13) mais re-assinatura. E
a re-assinatura tem uma saída melhor que garimpar o p12 no log do EAS: **criar
o perfil pela API do App Store Connect** com o certificado que ESTA máquina
tem. A chave ASC de `~/.credenciais/assumfit/` tem permissão para isso —
`GET /v1/certificates`, `GET /v1/bundleIds` e `POST /v1/profiles` respondem.

O conflito de certificados que travava tudo tem nome: o perfil que o EAS
embute contém `iPhone Distribution` (legado, `R9ZUQBW29U`), e o keychain daqui
tem `Apple Distribution` (moderno, `2NX4NGCJ96`). Assinar com um e apresentar o
perfil do outro faz a Apple recusar CADA framework na validação. Criando um
perfil `IOS_APP_STORE` que aponte para o certificado local, o conflito
desaparece.

Receita, do archive ao envio:

```bash
npx expo prebuild -p ios --clean
grep -c ExpoModulesJSI "ios/Pods/Target Support Files/Pods-AssumFit/Pods-AssumFit-frameworks.sh"  # precisa ser > 0
cd ios && EXPO_PUBLIC_API_URL=https://api.assumfit.com.br xcodebuild \
  -workspace AssumFit.xcworkspace -scheme AssumFit -configuration Release \
  -destination 'generic/platform=iOS' -archivePath /tmp/assumfit-archive.xcarchive \
  -allowProvisioningUpdates -authenticationKeyPath ~/.credenciais/assumfit/AuthKey_HL24V96G29.p8 \
  -authenticationKeyID HL24V96G29 -authenticationKeyIssuerID <issuer> archive
```

Depois: perfis novos pela API, `Payload/` a partir do `.xcarchive`, versão nos
DOIS `Info.plist` (app e `PlugIns/Treino.appex` — a Apple exige iguais),
entitlements extraídos do próprio perfil **menos `healthkit.access`** e com
`get-task-allow: false`, `codesign` de dentro para fora (frameworks → appex →
app) com `--timestamp`, zip do `Payload/` e `eas submit -p ios --path`.

Duas recusas que custam uma rodada cada:

- **"You've already submitted this version"** — é a `expo.version`
  (`CFBundleShortVersionString`), não o build. Versão já enviada não aceita
  binário novo: suba a versão.
- **"must be signed with the certificate that is contained in the
  provisioning profile"** repetido em todo framework — é o conflito de
  certificado acima, não um problema de cada framework.

### Testar com o relógio real

**O simulador não tem Bluetooth.** O CoreBluetooth reporta `unsupported` e não
faz ponte com o rádio do Mac; o emulador do Android também não passa BLE. Só
aparelho físico.

A fonte vem de `EXPO_PUBLIC_BLE`, não de editar `services/ble/index.ts` — dá
para alternar mock e relógio no mesmo build, que é o que torna viável mapear
UUID por tentativa e erro:

```bash
eas build --profile device --platform android   # APK, sem registrar aparelho
eas device:create && eas build --profile device --platform ios
EXPO_PUBLIC_BLE=real npx expo start --dev-client --port 8090
```

Com o real ligado, **Configurações → Diagnóstico GATT** enumera serviços e
características do aparelho conectado, com amostra em hexadecimal e botão de
compartilhar. O que aparece sem nome do Bluetooth SIG é proprietário — é o que
falta preencher em `staranb.ts`.

O perfil `device` do `eas.json` aponta para o IP da máquina na LAN. **Se a rede
mudar, esse IP muda** e o app fica sem servidor.

### O wearable fala pelo SDK do fabricante

A amostra é um **H59 da Shenzhen Tianpengyu** rebatizado — não um hardware
exclusivo. Ele não expõe o perfil padrão do Bluetooth SIG (`0x180D`); conversa
por canal serial proprietário, e o fabricante entregou o **QCBandSDK (QRing)**.

`modules/qcband/` é um módulo Expo local que embrulha o framework. A interface
`BleService` não mudou — quem troca é a implementação:

| `EXPO_PUBLIC_BLE` | serviço |
| --- | --- |
| ausente ou `real` | SDK do fabricante, com queda para GATT próprio se ele faltar |
| `gatt` | força `staranb.ts`, para inspecionar o protocolo |
| `mock` | wearable simulado — **só por pedido explícito** |

**O padrão é o relógio.** Era o contrário, e o mock silencioso custou horas: a
pulseira conectada "não aparecia" porque o Metro subira sem a variável, e o app
transmitia leitura inventada com cara de real. Num produto de saúde a pessoa não
tem como saber, olhando a tela, se aquele batimento é dela.

**Não existe dado de exemplo no `biometric.store.ts`.** Havia uma noite de sono
com score 82, 7.842 passos, uma semana de pressão e uma curva de temperatura de
24 h. Tudo removido: as séries se constroem a partir das leituras, e sem medição
`ratings.ts` devolve `available: false` e a tela mostra traço. Sinal ausente tem
o peso REDISTRIBUÍDO no score — inclusive o sono, que virou `SleepNight | null`.

**Esta pulseira não tem sensor de temperatura.** Verificado em `getFeatures`, no
histórico agendado, no manual e na medição sob demanda. A tela, a rota e o link
`assumfit://temperatura` foram removidos. O campo `temp` existe no cabeçalho do
SDK porque ele descreve a família inteira de aparelhos do fabricante.

**Estresse e HRV têm liga/desliga no firmware**, separado da capacidade:
`getFeatures` diz que a pulseira SABE medir, `getSchedualStressStatus` /
`getSchedualHRV` dizem se ela ESTÁ medindo. Chegam desligados — e desligados, a
medição sob demanda conclui com sucesso e devolve vazio.

O framework é **arm64 puro, sem fatia de simulador**. A saída NÃO é excluir o
alvo de simulador no podspec: `EXCLUDED_ARCHS` em `user_target_xcconfig` vaza
para o alvo do APP e o projeto inteiro fica sem destino de simulador — o app
para de rodar lá por causa de um módulo de Bluetooth, e o sintoma ("Unable to
find a destination matching the provided destination specifier") não aponta para
o podspec de forma nenhuma.

O módulo compila nos dois e só o FRAMEWORK é de aparelho: as flags do podspec
têm escopo `[sdk=iphoneos*]` — sempre com **`$(inherited)`**, senão elas
substituem os caminhos do CocoaPods e o `ExpoModulesCore` some do escopo — e o
Swift se anula no simulador com `#if !targetEnvironment(simulator)`.

A classe `QCBandModule` **precisa existir nos dois**, porque o
`ExpoModulesProvider` gerado a referencia por nome em qualquer build. No
simulador ela existe sem framework e responde `isSupported() == false`, que é o
que faz `services/ble/index.ts` cair no mock. Checar só a presença do módulo não
basta — é preciso perguntar se há rádio.

**Nada do SDK do fabricante pode rodar em `OnCreate`.** Ele executa na abertura
do app; uma versão que limpava o singleton e ligava os blocos ali fez o app
fechar sozinho ao abrir. O primeiro contato é em `connect`, quando alguém já
escolheu um aparelho.

**A pergunta em aberto:** o cabeçalho marca HRV como "Only Ring Support", mas
existem as flags `QCBandFeatureHRV` e `QCBandFeatureHRVInterval`, devolvidas
pelo aparelho no retorno de `setTime`. Quem decide é o firmware. O módulo
registra isso no log ao conectar.

### Bibliotecas deliberadamente fora

Não são limitação — são escolha, e reverter é fácil se aparecer necessidade:

- **`react-native-reanimated`** — a sidebar é um overlay próprio com o
  `Animated` do RN (`components/Sidebar.tsx`), o que dispensa
  `@react-navigation/drawer` e o Reanimated junto.
- **`@shopify/react-native-skia`** — os gráficos são `react-native-svg`
  (`components/HrvChart.tsx`). Para uma polyline de ~90 pontos dá no mesmo.
  Skia passa a valer se surgir desenho por frame.
- **`@tamagui/babel-plugin`** — o Tamagui roda sem ele. É otimização AOT de
  release, e o próprio MUVX o mantém desligado em desenvolvimento. Entra se e
  quando a performance pedir.
- **`react-native-linear-gradient`** — é nativo, e custaria um rebuild de dev
  client. Gradiente e halo saem do `react-native-svg` que já está instalado.

O **Tamagui**, ao contrário, entrou — e sem módulo nativo nenhum:
`@tamagui/config/v5` usa o driver `animations-react-native`, cujo único peer é
`react`. A migração inteira chegou por Metro.

## Regras de design (não negociáveis)

Paletas em `app/src/theme/palette.ts` (com espaçamento e raio, que não mudam com
o tema), traduzidas para tokens do Tamagui em `app/tamagui.config.ts`; a escala
tipográfica é `app/src/components/ui/Type.tsx`. Racional completo em
[SPEC.md](SPEC.md) § Design system.

O sistema visual é o do treino do MUVX — card com relevo, sombra em camadas,
halo radial, pill —, com a MARCA do AssumFit. Trouxemos a composição, não a
identidade: o acento é o roxo `#877BF0` do manual, nunca o verde `#24DB89` de
lá. As seis que mais se quebra por descuido:

0. **A paleta vem do manual de marca**, em `app/assets/brand/`. `ink`, `text` e
   `accent` são cores oficiais — não ajuste "para ficar melhor", e não importe
   cor do MUVX junto com um componente portado. Marca e logotipo são vetores
   oficiais em `components/Logo.tsx`, regerados do SVG, nunca editados à mão nem
   substituídos por texto.
1. **Relevo é o padrão; a linha continua existindo.** Card com sombra e halo é
   para a peça de destaque de uma tela — `Card` e `HeroCard` de
   `components/ui/Card.tsx`. Lista de propriedades continua sendo `Section` e
   `Row` de `components/Card.tsx`, separadas por hairline. Um card por linha de
   lista é ruído, não hierarquia.
2. **Um acento, e ele é do dado.** `$primary` em anel, arco, sparkline, régua,
   trilho — e no botão da ação principal, que é a única exceção nova. Ícone de
   navegação e rótulo seguem acromáticos.
3. **`$destructive` é reservado** para valor fora da faixa saudável (e para a
   ação irreversível). Não serve para separar "Bom" de "Excelente" — quem decide
   isso é `ratings.ts`, e ele devolve `state: 'normal' | 'alert'`, não uma cor
   por métrica.
4. **A hierarquia usa escala E peso, e o peso tem lugar fixo.** Título e
   avaliação são 700; corpo e dado são 400; **número grande é 200–300**, porque
   é o que o faz ler como instrumento e não como manchete. Não escolha o peso na
   tela: use os componentes de `components/ui/Type.tsx`, que são a escala inteira
   (`Display`, `Metric`, `Title`, `RatingText`, `Body`, `Data`, `Label`).
5. **Alinhamento à esquerda em conteúdo de tela.** Centralizado só dentro de uma
   peça que é simétrica por natureza — anel, botão, célula de calendário.
6. **Ícone é outline monolinear** de 1,5px. `components/Icon.tsx` só desenha
   traço; se um glifo novo precisar de `fill`, ele não pertence a este sistema.

**Regra de ouro:** o destaque é a avaliação em linguagem humana; o número
técnico é sub-label. Nenhuma tela formata número cru.

### Tema: nenhuma cor no escopo do módulo

O app tem tema claro e escuro. Isso muda COMO se escreve estilo, não só quais
cores existem:

- **`StyleSheet.create` está proibido para qualquer folha que use cor.** Ele
  congela os valores no import, e nenhum re-render os atualiza. O motor de
  estilo é o **Tamagui**: cor vai como token (`backgroundColor="$card"`,
  `color="$mutedForeground"`), resolvido a cada render. `makeStyles` não existe
  mais — foi a ponte durante a migração e saiu com o último arquivo.
- **O nome do token é do MUVX; o valor é nosso.** `$background`, `$card`,
  `$primary`, `$border`, `$mutedForeground` — é o que permite portar componente
  de lá sem reescrever prop por prop. Escrever hexadecimal em `tamagui.config.ts`
  cria uma segunda lista de cor que diverge em silêncio.
- **Importe de `@tamagui/core`, `@tamagui/stacks`, `@tamagui/linear-gradient` —
  nunca do barril `tamagui`.** O barril arrasta `@tamagui/popper`, que faz
  `import "react-dom"`; o bundle quebra na hora.
- **Cor crua ainda tem um uso legítimo:** valor calculado em tempo de execução
  (a cor da fase do treino, o retorno de `ratingTextColor`) vai em `style={{}}`,
  porque `backgroundColor` de token só aceita nome de token. Fora esse caso, é
  cheiro de token faltando.
- **Cor em valor padrão de parâmetro não compila.** `color = colors.accent` na
  assinatura é avaliado antes do corpo, onde `useTheme()` vive. O padrão desce
  uma linha: `color = color ?? colors.accent`.
- **Módulo de domínio não importa paleta.** `ratings.ts` recebe `colors` por
  parâmetro — ele roda em teste, sem árvore React, e não existe UMA paleta para
  importar.
- **`app.json` precisa de `userInterfaceStyle: "automatic"`.** Com `"dark"` o
  iOS trava a aparência e o modo "Sistema" nunca muda. Alterar isso exige
  rebuild — é config nativa.
- `useTheme()` do `theme/ThemeProvider.tsx` **continua existindo**, e não é
  legado: é ele que resolve `system|light|dark` e que sabe a diferença entre a
  aparência do app e a do SISTEMA, que o vidro do iOS 26 precisa. O
  `TamaguiProvider` monta POR DENTRO dele. Componente que precisa de cor como
  VALOR — para passar a um SVG, a um `ActivityIndicator`, a um ícone — pega dali.
- Só o `alert` muda de valor entre os temas. O acento é o mesmo nos dois, e há
  teste travando isso (`domain/__tests__/ratings.test.ts`).

### Relevo — vidro é do controle, sombra é do conteúdo

Duas famílias, e usar a errada é o jeito mais fácil de estragar o sistema.

`components/Surface.tsx` é a camada de **controle**:

- **`Glass`** — Liquid Glass nativo (`expo-glass-effect`, iOS 26) com fallback
  translúcido. Barra de abas, painel lateral, modal. É a própria regra da Apple.
  Vidro em cartão de métrica vira decoração.
- **`Surface`** e **`EmbossedDivider`** — superfície e divisória com aresta.

`components/ui/` é a camada de **conteúdo**:

- **`ShadowView`** — existe porque o `YStack` do Tamagui **descarta em silêncio**
  `shadowColor`/`shadowOpacity`/`shadowRadius`. Toda sombra passa por ele.
- **`elevation.ts`** — os quatro níveis (`useCardShadow`, `useHighlightShadow`,
  `useCtaShadow`, `useFabShadow`). Não invente um quinto no arquivo da tela.
- **`RadialHalo`** — o halo do canto do card de destaque, em `react-native-svg`.
  Gradiente vem daí, não de `react-native-linear-gradient`: aquele é nativo e
  custaria um rebuild de dev client.
- **`Button`** — `primary` (preenchido, com sombra colorida, no máximo um por
  tela), `secondary` (contornado), `ghost` (só texto). Não escreva um `Pressable`
  com pill de acento à mão; foi assim que três telas divergiram entre si.

No escuro o relevo é **material**: a peça se destaca porque é mais clara que o
fundo, e a aresta especular basta. **No claro esse truque não existe** — não há
"mais claro que o papel", e ali a espessura vem de sombra. Um card que parece bom
no escuro e chapado no claro é o defeito mais provável de qualquer mudança nesta
camada; **confira sempre nos dois** (`xcrun simctl ui booted appearance light`).

Duas armadilhas do vidro nativo:

- O `GlassView` do iOS 26 refrata segundo a aparência do **sistema**, não a do
  app. `Glass` desliga o efeito nativo quando os dois divergem — sem isso, o
  painel lateral fica escuro com o app no claro.
- `supportsLiquidGlass` é falso em dev client sem o módulo; o fallback é
  translúcido opaco, não vidro.

## Regras de dados

- Dado biométrico é **dado pessoal sensível** (LGPD Art. 5º II). Toda tabela nova que armazene biometria precisa de vínculo com consentimento e política de retenção. Nunca logar valor biométrico com `user_id` junto.
- **Linha de base de HRV é por FONTE.** HRV não é número universal, é resultado de um método: a banda calcula RMSSD, o Apple Watch reporta SDNN, o seed tem a própria distribuição. `hrvBaseline` usa só a fonte da leitura mais recente — misturar produz uma média que não corresponde a nenhuma, e ela é o denominador do score inteiro.
- `biometric_readings` é hypertable TimescaleDB: qualquer PK/UNIQUE precisa incluir `recorded_at`.
- Prisma não gerencia hypertables nem políticas de retenção — essas partes vão em migrations SQL escritas à mão.
- Toda métrica exibida ao usuário passa por `app/src/domain/ratings.ts`, que devolve `{ label, color, detail, fraction }`. **Nenhuma tela formata número cru** — se uma tela está montando string de unidade, falta uma função de avaliação.

## Produção

`docker-compose.prod.yml` é o de valer; o `docker-compose.yml` tem segredos de
exemplo escritos à vista e serve só para desenvolver. Diferenças que importam:
banco e serviço de modelo **não publicam porta**, a API escuta em 127.0.0.1
atrás do Caddy (que faz ACME sozinho), e as migrations rodam antes de o servidor
aceitar tráfego.

`env.ts` recusa subir em produção com segredo de exemplo, com os dois segredos
de JWT iguais, com `PUBLIC_URL` em http ou **sem `REDIS_URL`** — contador de
limite em memória é por processo, e com duas réplicas o limite efetivo dobra sem
que nada acuse.

O contêiner `backup` despeja o banco, **verifica o dump com `pg_restore --list`**
e só então poda os antigos. Invertida, uma sequência de falhas apagaria os
backups bons até não sobrar nenhum. `prisma/seed.ts` também se recusa a
rodar — ele cria contas com senha pública.

O endereço da API vai fixado no build por perfil do `eas.json`. Sem
`EXPO_PUBLIC_API_URL`, um build de produção **não compila** em vez de apontar
para localhost em silêncio.

## Onboarding e perfil de rotina

As perguntas se RAMIFICAM: quem responde "não pratico atividade" nunca vê "em
que dias você treina", e o enunciado cita a resposta anterior. O grafo é dado,
não código espalhado por tela — mora em `app/src/domain/onboarding.ts` e é
testado sem montar componente.

**Regra do onboarding:** campo que não altera nenhuma recomendação não entra.
Se não der para escrever o comentário dizendo qual sugestão o campo muda, a
pergunta é atrito. Hoje: postura decide o aviso de movimento, turno desloca a
curva circadiana, dia de treino muda a ação da home.

**Turno noturno não é "vespertino".** Vespertino é quem tem pico no fim da
tarde — dois passos de curva. Quem dorme às 9h tem o ciclo invertido, dez
passos. O enum de três posições não representa isso, e por isso existe
`circadian_shift` derivado da hora de dormir, que substitui o cronótipo quando
presente.

## Escopo médico

O produto é de esporte, bem-estar e autoconhecimento, **não é dispositivo médico**. Não há diagnóstico, alerta clínico nem recomendação de tratamento em nenhuma tela. (Desde ago/2026 a home incentiva treino e recuperação, não produtividade — ver PRODUCT.md § Reposicionamento.)

O disclaimer e as explicações de método moram na tela de **Ajuda** ("Isto não é
um exame", pressão como tendência, de onde vem cada número) — decisão de
jul/2026: **tela de métrica não carrega rodapé explicativo fixo.** Os blocos
`<Note>` que sobrevivem nas telas são de ESTADO (erro, vazio, consentimento
pendente, wearable simulado), nunca texto permanente de fim de página. Conteúdo
novo que precise se explicar entra na Ajuda, não num rodapé.
