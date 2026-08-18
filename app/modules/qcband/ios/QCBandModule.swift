import CoreBluetooth
import ExpoModulesCore

/*
 Tudo que fala com o SDK do fabricante existe só no APARELHO.

 O framework é arm64 puro, sem fatia de simulador, e `import QCBandSDK` não
 resolve lá. A versão anterior tratava isso excluindo o alvo de simulador no
 podspec — o que derrubava o app inteiro no simulador, onde a maior parte do
 desenvolvimento acontece.

 Aqui o módulo compila nos dois. No simulador ele existe, responde, e diz com
 todas as letras que não há Bluetooth — que é a verdade: o simulador não faz
 ponte com o rádio do Mac.
 */
#if !targetEnvironment(simulator)
import QCBandSDK

/**
 A parte CoreBluetooth, separada do módulo Expo.

 Não é organização: é obrigatório. `CBCentralManagerDelegate` herda de
 `NSObjectProtocol`, e o Swift só aceita conformidade a esse protocolo em classe
 que herde de `NSObject`. O `Module` do ExpoModulesCore não herda — então o
 módulo NÃO pode ser o delegate, e a tentativa falha no compilador com
 "cannot declare conformance to 'NSObjectProtocol' in Swift".

 A separação também deixa o rádio testável e o módulo fino: aqui mora estado de
 conexão, ali mora tradução para o JavaScript.
 */
final class QCBandBridge: NSObject, CBCentralManagerDelegate {
  private var central: CBCentralManager?
  private var discovered: [String: CBPeripheral] = [:]
  private var connected: CBPeripheral?
  /// Varredura pedida antes de o rádio ficar pronto. Ver `startScan`.
  private var scanPending = false
  /// Guarda contra resolver a entrega ao SDK duas vezes. Ver `handOver`.
  private var handoverSettled = false
  /// Quantas entregas já foram tentadas nesta conexão. Ver `handOver`.
  private var handoverAttempts = 0
  /// Desconexão provocada por nós, para retentar — não é queda. Ver `handOver`.
  private var retrying = false

  /**
   Serviços usados só para PERGUNTAR ao sistema quem já está conectado.

   Não é filtro de varredura — a varredura continua sem filtro nenhum, porque a
   H59 não anuncia serviço algum. Esta lista serve a outra pergunta:
   `retrieveConnectedPeripherals` EXIGE serviços e devolve só quem os expõe.

   Generic Access (0x1800) é obrigatório em todo periférico BLE por
   especificação — é o denominador comum que faz a consulta devolver qualquer
   coisa conectada. Os proprietários 0xFFF0/0xFFE0/0xFEE7 entram por serem os
   mais comuns em módulos BLE baratos, categoria desta pulseira.
   */
  private static let discoveryServices: [CBUUID] = [
    CBUUID(string: "1800"),
    CBUUID(string: "180A"),
    CBUUID(string: "180D"),
    CBUUID(string: "180F"),
    CBUUID(string: "FFF0"),
    CBUUID(string: "FFE0"),
    CBUUID(string: "FEE7"),
  ]

  /// Chamados pelo módulo para virarem eventos do React Native.
  var onDevice: (([String: Any]) -> Void)?
  var onState: (([String: Any]) -> Void)?
  var onLog: (([String: Any]) -> Void)?

  override init() {
    super.init()
    central = CBCentralManager(delegate: self, queue: .main)
  }

  var isPoweredOn: Bool { central?.state == .poweredOn }

  /**
   Varre sem filtro de serviço, de propósito.

   A pulseira H59 **não anuncia serviço nenhum** — descoberto capturando os
   anúncios um a um. Filtrar por UUID aqui a esconderia por completo, que foi
   exatamente o que travou o pareamento antes.
   */
  func startScan() {
    guard let central = central, central.state == .poweredOn else {
      /*
       O rádio ainda não está pronto — e isso é normal, não é erro.

       O `CBCentralManager` reporta `.unknown` por cerca de um segundo depois de
       criado, até o sistema responder. Uma tela de pareamento aberta nesse
       intervalo caía aqui, mostrava "bluetooth indisponível" e nunca mais
       tentava: a varredura era descartada em silêncio e só um novo toque a
       ressuscitava.

       Guardar a intenção e retomar em `centralManagerDidUpdateState` custa uma
       linha e remove a corrida. Só vira erro de verdade se o estado final for
       desligado ou negado.
       */
      scanPending = true
      return
    }
    scanPending = false
    discovered.removeAll()
    emitAlreadyConnected(central)
    onState?(["state": "scanning"])
    central.scanForPeripherals(
      withServices: nil,
      options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]
    )
  }

  /**
   Aparelho já conectado ao sistema NÃO ANUNCIA, e por isso nunca chega em
   `didDiscover`.

   É a diferença entre estar conectado e estar anunciando: quem já tem uma
   ligação ativa com o iPhone — pareado nos Ajustes, ou usado por outro app —
   parou de gritar o próprio nome faz tempo. Uma varredura, por mais demorada
   que seja, nunca o encontra. Só esta consulta ao sistema o revela.

   Sem isto, a pulseira que a pessoa acabou de parear é justamente a que some da
   lista, que é o pior comportamento possível: quanto mais certo o aparelho,
   menos ele aparece.
   */
  private func emitAlreadyConnected(_ central: CBCentralManager) {
    let already = central.retrieveConnectedPeripherals(
      withServices: QCBandBridge.discoveryServices
    )
    for peripheral in already {
      let id = peripheral.identifier.uuidString
      // Guardado no mesmo dicionário da varredura: sem isso `connect` não o
      // encontra e falha com "não está na lista".
      discovered[id] = peripheral

      /*
       RSSI fixo em -50 porque não existe medida sem anúncio, e a lista da tela
       ordena por sinal. -50 é forte o bastante para o aparelho ficar no topo,
       que é onde ele deve estar — já está conectado. Fingir 0 dBm seria mentir
       com mais convicção ainda.
       */
      let payload: [String: Any] = [
        "id": id,
        "name": peripheral.name ?? "",
        "rssi": -50,
        "serviceUUIDs": [String](),
        "alreadyConnected": true,
      ]
      onDevice?(payload)
    }
  }

  func stopScan() {
    central?.stopScan()
  }

  func connect(id: String) throws {
    guard let central = central else {
      throw QCBandError.deviceNotFound
    }
    var alvo = discovered[id]
    if alvo == nil, let uuid = UUID(uuidString: id) {
      /*
       Reconexão FRIA: o mapa de descobertos nasce vazio a cada processo, e
       era por isso que o connect do arranque e o botão Reconectar falhavam
       com deviceNotFound. O CoreBluetooth guarda o periférico pareado por
       identificador — recuperá-lo aqui dispensa rescanear para reconectar.
       (O lado JS ainda cai para scan quando até isto falhar.)
      */
      alvo = central.retrievePeripherals(withIdentifiers: [uuid]).first
      if let recuperado = alvo {
        discovered[id] = recuperado
        onLog?(["raw": "connect frio: periférico recuperado por identificador"])
      }
    }
    guard let peripheral = alvo else {
      throw QCBandError.deviceNotFound
    }
    central.stopScan()
    connected = peripheral
    handoverAttempts = 0
    retrying = false
    onState?(["state": "connecting"])
    onLog?(["raw": "connect: \(id) | estado do periférico = \(peripheral.state.rawValue)"])

    /*
     Já conectado a ESTE app: entrega direto, sem passar por `connect`.

     É o caso que travava a tela. `central.connect` num periférico que já está
     no estado `.connected` para o nosso processo NÃO dispara `didConnect` de
     novo — o CoreBluetooth não tem o que notificar, a conexão já existe. Como
     toda a entrega ao SDK pendurava nesse callback, o segundo toque no aparelho
     ficava em "Conectando" para sempre.

     Acontece com facilidade: basta a primeira tentativa ter falhado depois da
     conexão, ou a pessoa voltar para a tela de pareamento com o aparelho ainda
     ligado.
     */
    if peripheral.state == .connected {
      onLog?(["raw": "já conectado a este app, entregando direto ao SDK"])
      handOver(peripheral)
      return
    }
    central.connect(peripheral, options: nil)
  }

  /**
   Entrega o periférico ao SDK, que é o que habilita todos os comandos.

   Antes disto ele não sabe com quem falar, e qualquer chamada de
   `QCSDKCmdCreator` falha em silêncio — sem erro, sem resposta. O estado só vira
   `connected` depois da confirmação, para a interface não anunciar uma conexão
   que ainda não serve para nada.

   O prazo existe porque `addPeripheral:finished:` é código de terceiro sem
   contrato de tempo: se ele nunca chamar de volta — aparelho ocupado, firmware
   que não responde à negociação —, o app fica preso em "Conectando" sem nada a
   fazer. Preso é pior que falho: falho a pessoa pode tentar de novo.
   */
  private func handOver(_ peripheral: CBPeripheral) {
    handoverSettled = false
    handoverAttempts += 1
    let attempt = handoverAttempts

    /*
     Limpar ANTES de entregar, sempre.

     `QCSDKManager.shareInstance()` é singleton de PROCESSO: ele sobrevive ao
     recarregamento do JavaScript, que recria o módulo Expo, a ponte e o
     `CBCentralManager`. O central antigo morre levando a conexão junto, mas o
     SDK continua segurando o periférico anterior — agora inválido.

     Nesse estado, `addPeripheral:` com um periférico novo simplesmente NÃO
     chama `finished`. Não devolve erro, não devolve falso: silêncio.
     */
    QCSDKManager.shareInstance().removeAllPeripheral()
    onLog?(["raw": "entregando ao SDK (tentativa \(attempt))"])

    QCSDKManager.shareInstance().add(peripheral) { [weak self] success in
      guard let self = self, !self.handoverSettled else { return }
      self.handoverSettled = true
      self.retrying = false
      self.onLog?(["raw": "SDK respondeu à entrega: \(success)"])
      if success {
        self.onState?(["state": "connected"])
        self.listenForDeviceData()
      } else {
        self.onState?(["state": "error", "reason": "o SDK recusou o aparelho"])
      }
    }

    /*
     Prazo curto e UMA retentativa, em vez de um prazo longo e desistência.

     `addPeripheral:finished:` é código de terceiro sem contrato de tempo, e
     quando o singleton está sujo ele fica mudo para sempre. Limpar antes de
     entregar deveria bastar — mas "deveria" não é diagnóstico, e cada aposta
     errada aqui custa um build inteiro de EAS.

     Então o segundo caminho não depende de a limpeza ter funcionado: derruba a
     conexão e refaz do zero, que devolve o SDK ao mesmo estado do primeiro
     pareamento depois de abrir o app — o único que sempre funcionou. São oito
     segundos por tentativa, não quinze, porque agora existe algo melhor a fazer
     do que esperar.
     */
    DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
      guard let self = self, !self.handoverSettled else { return }

      if attempt < 2, let central = self.central {
        self.onLog?(["raw": "SDK mudo em 8s — derrubando a conexão para refazer"])
        self.retrying = true
        central.cancelPeripheralConnection(peripheral)
        return
      }

      self.handoverSettled = true
      self.retrying = false
      self.onLog?(["raw": "SDK não respondeu depois de \(attempt) tentativas"])
      self.onState?([
        "state": "error",
        "reason": "A pulseira conectou, mas não respondeu. Feche o app do fabricante, se estiver aberto, e tente de novo.",
      ])
    }
  }

  func disconnect() {
    /*
     Solta o aparelho no SDK ANTES de derrubar o rádio.

     A ordem importa: o singleton do SDK sobrevive a esta ponte, e um periférico
     esquecido nele é o que deixa a próxima entrega muda para sempre.
     */
    QCSDKManager.shareInstance().removeAllPeripheral()
    // Desconexão pedida pela pessoa não é queda a recuperar.
    retrying = false
    handoverSettled = true
    if let peripheral = connected {
      central?.cancelPeripheralConnection(peripheral)
    }
    connected = nil
    onState?(["state": "idle"])
  }

  // MARK: - CBCentralManagerDelegate

  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    if central.state == .poweredOn {
      onState?(["state": "idle"])
      // Retoma a varredura pedida antes de o rádio responder.
      if scanPending { startScan() }
      return
    }

    // Mensagem por estado: "bluetooth indisponível" não diz à pessoa se ela
    // precisa ligar o rádio ou dar permissão ao app — são ações diferentes.
    let reason: String
    switch central.state {
    case .poweredOff: reason = "O Bluetooth está desligado"
    case .unauthorized: reason = "O app não tem permissão de Bluetooth"
    case .unsupported: reason = "Este aparelho não tem Bluetooth"
    default: reason = "Bluetooth indisponível"
    }
    onState?(["state": "error", "reason": reason])
  }

  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    let id = peripheral.identifier.uuidString
    discovered[id] = peripheral

    // O nome às vezes só existe no pacote de scan response, então o do anúncio
    // vem primeiro: sem isso a lista mostra "sem nome" para aparelho que se
    // identificou.
    let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
    let services = (advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID])?
      .map { $0.uuidString.lowercased() } ?? []

    onDevice?([
      "id": id,
      "name": advertisedName ?? peripheral.name ?? "",
      "rssi": RSSI.intValue,
      "serviceUUIDs": services,
    ])
  }

  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    onLog?(["raw": "didConnect"])
    retrying = false
    handOver(peripheral)
  }

  func centralManager(
    _ central: CBCentralManager,
    didFailToConnect peripheral: CBPeripheral,
    error: Error?
  ) {
    onLog?(["raw": "didFailToConnect: \(error?.localizedDescription ?? "sem detalhe")"])
    onState?(["state": "error", "reason": error?.localizedDescription ?? "falha ao conectar"])
  }

  func centralManager(
    _ central: CBCentralManager,
    didDisconnectPeripheral peripheral: CBPeripheral,
    error: Error?
  ) {
    /*
     Queda que NÓS provocamos, para retentar: reconecta e segue em "Conectando".
     Anunciar `idle` aqui devolveria a pessoa à lista de aparelhos no meio de uma
     recuperação que está funcionando.
     */
    if retrying {
      onLog?(["raw": "desconectado para retentar — reconectando"])
      central.connect(peripheral, options: nil)
      return
    }

    connected = nil
    handoverSettled = true
    onLog?(["raw": "didDisconnect: \(error?.localizedDescription ?? "sem erro")"])
    onState?(["state": "idle", "reason": error?.localizedDescription ?? ""])
  }

  /**
   O fluxo dispositivo→telefone do SDK sai por `NotificationCenter`, não por
   delegate, então a ponte se inscreve ali.

   Encaminhado cru nesta primeira versão de propósito: enquanto o formato não
   estiver confirmado contra o aparelho, ver o que chega vale mais que uma
   tradução que pode estar errada.
   */
  private func listenForDeviceData() {
    NotificationCenter.default.addObserver(
      forName: NSNotification.Name(OdmNotifyD2P),
      object: nil,
      queue: .main
    ) { [weak self] note in
      let info: [AnyHashable: Any] = note.userInfo ?? [:]
      self?.onLog?(["raw": String(describing: info)])
    }
  }
}

enum QCBandError: Error, LocalizedError {
  case deviceNotFound

  var errorDescription: String? {
    switch self {
    case .deviceNotFound: return "Aparelho não está na lista da varredura"
    }
  }
}

/**
 Ponte para o SDK do fabricante da pulseira.

 **Por que o módulo domina todo o ciclo BLE, e não só os comandos.**

 O `QCSDKManager` recebe um `CBPeripheral` já conectado — `addPeripheral:` — e a
 partir dali fala com o aparelho por conta própria. Não dá para entregar a ele um
 periférico do `react-native-ble-plx`: são grafos de objeto diferentes, e o SDK
 precisa da instância original do CoreBluetooth. Então a varredura e a conexão
 mudam de dono aqui, e o `ble-plx` deixa de participar do caminho do aparelho
 real.

 A interface `BleService` do lado TypeScript não muda. É ela que absorve a troca.
 */
public class QCBandModule: Module {
  private let bridge = QCBandBridge()
  /// Se os blocos do SDK já foram ligados. Ver `wireSDKCallbacks`.
  private var callbacksWired = false
  /// Atalho para o mesmo canal de log da ponte, usado fora dela.
  private var onLogFromModule: (([String: Any]) -> Void)?

  /**
   Liga as propriedades de bloco do SDK aos eventos do React Native.

   O dado JÁ ESTAVA CHEGANDO antes disto e era descartado. O `NotificationCenter`
   entregava os quadros crus — `69 06 00 48 … b7`, que é frequência cardíaca em
   72 bpm com checksum válido — e o único destino deles era uma linha de log.
   Enquanto isso a tela inicial mostrava traço.

   Estas propriedades são o caminho que o fabricante pretendia: o SDK já
   desmonta o quadro, valida o checksum e entrega o número. Ler o byte na mão
   seria refazer, pior, o que o framework faz de graça — e foi o motivo de
   adotarmos o SDK.

   Cada bloco tem os tipos anotados de propósito: são blocos ObjC atribuídos a
   propriedades, onde a inferência do Swift não tem de onde partir.
   */
  /**
   Nome do produto → tipo do SDK.

   A tabela existe para o TypeScript não precisar conhecer o enum do fabricante:
   ele pede "spo2", não `QCMeasuringTypeBloodOxygen`. Se o SDK renumerar o enum
   numa atualização, só esta função muda.
   */
  /**
   Traduz o resultado de uma medição em eventos de leitura.

   Existe porque a suposição anterior estava errada: eu descartava este
   resultado achando que todo valor chegaria pelos blocos do SDK
   (`boMeasuring` e companhia). Só batimento e pressão chegam por lá — o resto
   vinha aqui e ia para o lixo, e a tela ficava com traço.

   O modelo do `oneKey` é o mais generoso do SDK: além de batimento e pressão,
   traz HRV em milissegundos, estresse de 0 a 100 e temperatura. É bem mais do
   que o nome "medição de batimento" sugere, e cobre quase toda a tela numa
   chamada só.

   Zero é ausência, não medida: o firmware preenche com 0 o que não mediu, e
   emitir isso viraria "0 bpm" ou "0 °C" na interface.
   */
  private func emitMeasurement(kind: String, result: Any?) {
    // É o que responde onde este firmware entrega HRV, já que a porta de
    // histórico agendado é "Only Ring Support".
    /*
     O SDK devolve dicionário ou número cru — NÃO os modelos do cabeçalho.

     Eu tinha escrito `as? QCRealOneKeyMeasureHeartRateModel` a partir do `.h`, e
     o cast nunca casava: o valor chegava e era descartado em silêncio. Foi por
     isso que estresse, HRV e temperatura sumiram sem deixar rastro.

     O que o aparelho manda de verdade, capturado no log:

       oneKey → { hr = 68; sbp = 123; dbp = 76; so2 = 97; score = 99 }
       spo2   → 97

     Como número cru não diz que grandeza é, `kind` acompanha o resultado.
     */
    if let dict = result as? [String: Any] {
      /*
       O SDK REAPROVEITA a estrutura de pressão para outras grandezas.

       A medição de estresse devolve `["sbp": 47, "dbp": 0]` — o valor vem no
       campo da sistólica, e não existe chave chamada "stress" em lugar nenhum.
       Descoberto no aparelho: o app do fabricante mostrava estresse enquanto o
       nosso não, e o log das chaves cruas foi o que revelou.

       Por isso a interpretação depende do que foi PEDIDO. Ler `sbp` como
       pressão aqui produziria "47 por 0 mmHg" na tela — um valor absurdo com
       cara de medida.
       */
      if kind == "stress" {
        let valor: Int = (dict["sbp"] as? NSNumber)?.intValue ?? 0
        if valor > 0 {
          let p: [String: Any] = ["kind": "stress", "value": valor]
          sendEvent("onReading", p)
        } else {
          onLogFromModule?(["raw": "estresse veio zerado: \(dict)"])
        }
        return
      }

      var emitiu = false
      let hr: Int = (dict["hr"] as? NSNumber)?.intValue ?? 0
      if hr > 0 {
        let p: [String: Any] = ["kind": "heartRate", "value": hr]
        sendEvent("onReading", p)
        emitiu = true
      }

      let so2: Int = (dict["so2"] as? NSNumber)?.intValue ?? 0
      if so2 > 0 {
        let p: [String: Any] = ["kind": "spo2", "value": so2]
        sendEvent("onReading", p)
        emitiu = true
      }

      let sbp: Int = (dict["sbp"] as? NSNumber)?.intValue ?? 0
      let dbp: Int = (dict["dbp"] as? NSNumber)?.intValue ?? 0
      if sbp > 0, dbp > 0 {
        let p: [String: Any] = ["kind": "bloodPressure", "systolic": sbp, "diastolic": dbp]
        sendEvent("onReading", p)
        emitiu = true
      }

      /*
       `score` fica de fora até sabermos o que é.

       Chega como 99 numa medição de repouso. Pode ser qualidade do sinal,
       índice de bem-estar ou estresse invertido — e chutar entre essas
       possibilidades produziria um número plausível e errado numa tela de
       saúde. A medição dedicada de estresse responde isso sem adivinhação.
       */
      /*
       HRV, se vier junto.

       O modelo `QCRealOneKeyMeasureHeartRateModel` declara `heartRateHRV` em
       milissegundos, e nenhuma chave era procurada aqui: numa medição que
       trouxesse variabilidade, o valor chegava e ia embora. A porta de
       histórico agendado é "Only Ring Support" e devolve vazio nesta pulseira
       — provado no aparelho —, então a medição sob demanda é a única fonte de
       HRV que resta, e descartá-la deixaria o produto sem o componente de
       maior peso do score.
      */
      let hrv: Int =
        (dict["hrv"] as? NSNumber)?.intValue
        ?? (dict["heartRateHRV"] as? NSNumber)?.intValue
        ?? 0
      if hrv > 0 {
        let p: [String: Any] = ["kind": "hrv", "value": hrv]
        sendEvent("onReading", p)
        emitiu = true
      }

      let score: Int = (dict["score"] as? NSNumber)?.intValue ?? 0
      if score > 0 {
        onLogFromModule?(["raw": "oneKey trouxe score=\(score) (semântica ainda não confirmada)"])
      }

      /*
       Dicionário que não rendeu nada é REGISTRADO com as chaves dele.

       Este ramo devolvia em silêncio quando nenhuma chave conhecida aparecia — e
       foi assim que o estresse sumiu: a medição concluía com sucesso, o
       resultado chegava aqui e ia embora sem produzir leitura nem log. Sem as
       chaves, não há como saber o que o firmware manda.
       */
      if !emitiu {
        let chaves: String = dict.keys.sorted().joined(separator: ", ")
        /*
         `NSLog` além do `onLog`: em Release o log do JavaScript não chega a
         lugar nenhum, e foi por isso que a forma do resultado de HRV ficou
         desconhecida por tanto tempo. Este caminho só corre quando uma medição
         conclui sem render nada, ou seja, quase nunca — e é exatamente quando
         alguém vai precisar da informação.
        */
        NSLog("[qcband] medição %@ sem chave conhecida — chaves: [%@]", kind, chaves)
        onLogFromModule?([
          "raw": "medição \(kind) devolveu dicionário sem chave conhecida — chaves: [\(chaves)] conteúdo: \(dict)",
        ])
      }
      return
    }

    // Número cru: só o tipo pedido diz de que grandeza se trata.
    if let numero = result as? NSNumber {
      let valor: Int = numero.intValue
      guard valor > 0 else {
        // Zero registrado, não engolido: silêncio aqui não distingue "mediu
        // zero" de "não devolveu nada", e foi isso que travou o diagnóstico do
        // estresse.
        onLogFromModule?(["raw": "medição \(kind) devolveu \(valor) — sem valor útil"])
        return
      }
      let p: [String: Any] = ["kind": kind, "value": valor]
      sendEvent("onReading", p)
      return
    }

    onLogFromModule?([
      "raw": "medição \(kind) devolveu formato não reconhecido: \(String(describing: result))",
    ])
  }

  private static func measuringType(_ kind: String) -> QCMeasuringType? {
    switch kind {
    case "hrv": return .HRV
    case "heartRate": return .heartRate
    case "spo2": return .bloodOxygen
    case "bloodPressure": return .bloodPressue
    case "stress": return .stress
    case "temperature": return .bodyTemperature
    // Mede batimento, SpO₂ e pressão numa tacada — o caminho mais barato para
    // preencher a tela inteira, e o firmware desta pulseira declara suporte.
    case "oneKey": return .oneKeyMeasure
    default: return nil
    }
  }

  private func wireSDKCallbacks() {
    // Idempotente: `connect` pode ser chamado várias vezes, e reatribuir os
    // blocos a cada tentativa não traz nada.
    guard !callbacksWired else { return }
    callbacksWired = true

    let sdk = QCSDKManager.shareInstance()

    /*
     Cada bloco calcula ANTES e monta o dicionário só com variáveis locais.

     Nada de `max(a, b)`, `Double(x)` ou operação dentro do literal. Um literal
     `[String: Any]` já obriga o Swift a resolver cada valor contra `Any`;
     somando a isso uma função genérica como `max`, a inferência estoura e o
     compilador responde "failed to produce diagnostic for expression" — sem
     linha, sem expressão. Foi o que derrubou este build.

     Verboso de propósito. O custo é uma linha por valor; o de errar é um ciclo
     inteiro de EAS às cegas.
     */

    sdk.realTimeHeartRate = { [weak self] (hr: Int) in
      guard hr > 0 else { return }
      let payload: [String: Any] = ["kind": "heartRate", "value": hr]
      self?.sendEvent("onReading", payload)
    }

    // Medição pontual, disparada pelo aparelho ou por comando — chega por outro
    // bloco que a contínua, mas para o produto é a mesma grandeza.
    sdk.hrMeasuring = { [weak self] (hr: Int) in
      guard hr > 0 else { return }
      let payload: [String: Any] = ["kind": "heartRate", "value": hr]
      self?.sendEvent("onReading", payload)
    }

    sdk.boMeasuring = { [weak self] (so2: CGFloat) in
      guard so2 > 0 else { return }
      let value: Double = Double(so2)
      let payload: [String: Any] = ["kind": "spo2", "value": value]
      self?.sendEvent("onReading", payload)
    }

    sdk.bpMeasuring = { [weak self] (sbp: Int, dbp: Int) in
      guard sbp > 0, dbp > 0 else { return }
      /*
       O cabeçalho do fabricante troca os nomes: documenta `sbp` como
       "Diastolic" e `dbp` como "systolic". É erro da documentação, não do
       firmware — sistólica é sempre a maior. Ordenar pelo VALOR resiste tanto ao
       engano do cabeçalho quanto a uma correção futura dele.
       */
      let systolic: Int = sbp > dbp ? sbp : dbp
      let diastolic: Int = sbp > dbp ? dbp : sbp
      let payload: [String: Any] = [
        "kind": "bloodPressure",
        "systolic": systolic,
        "diastolic": diastolic,
      ]
      self?.sendEvent("onReading", payload)
    }

    sdk.currentStepInfo = { [weak self] (step: Int, calorie: Int, distance: Int) in
      let payload: [String: Any] = [
        "kind": "steps",
        "value": step,
        "calorie": calorie,
        "distance": distance,
      ]
      self?.sendEvent("onReading", payload)
    }

    sdk.currentBatteryInfo = { [weak self] (battery: Int, charging: Bool) in
      let payload: [String: Any] = ["kind": "battery", "value": battery, "charging": charging]
      self?.sendEvent("onReading", payload)
    }

    // Pulseira mal encaixada devolve número inventado. Melhor dizer que falhou.
    sdk.measuringFail = { [weak self] in
      let payload: [String: Any] = ["kind": "measuringFail"]
      self?.sendEvent("onReading", payload)
    }
  }

  public func definition() -> ModuleDefinition {
    Name("QCBand")

    Events("onDevice", "onState", "onReading", "onLog")

    // Par da variante de simulador: é o que o TypeScript consulta para saber se
    // existe rádio de verdade atrás deste módulo.
    Function("isSupported") { () -> Bool in true }

    /*
     NADA de SDK do fabricante aqui.

     `OnCreate` roda na ABERTURA do app, e o que estiver dentro executa antes de
     existir aparelho, permissão de Bluetooth ou intenção da pessoa de parear.
     Uma versão anterior chamava `removeAllPeripheral()` e ligava os blocos do
     SDK neste ponto — e o app passou a fechar sozinho ao abrir.

     Este bloco só liga a ponte ao React Native, que é código nosso. O framework
     do fabricante é tocado pela primeira vez em `connect`, quando o app já está
     de pé e alguém escolheu um aparelho.
     */
    OnCreate {
      self.bridge.onDevice = { [weak self] payload in self?.sendEvent("onDevice", payload) }
      self.bridge.onState = { [weak self] payload in self?.sendEvent("onState", payload) }
      self.bridge.onLog = { [weak self] payload in self?.sendEvent("onLog", payload) }
      self.onLogFromModule = { [weak self] payload in self?.sendEvent("onLog", payload) }
      self.wireSDKCallbacks()
    }

    AsyncFunction("startScan") {
      self.bridge.startScan()
    }

    AsyncFunction("stopScan") {
      self.bridge.stopScan()
    }

    AsyncFunction("connect") { (id: String) in
      // Primeiro contato com o SDK, e o mais tarde possível: aqui o app já
      // está rodando e a pessoa escolheu um aparelho.
      self.wireSDKCallbacks()
      try self.bridge.connect(id: id)
    }

    AsyncFunction("disconnect") {
      self.bridge.disconnect()
    }

    /**
     Quais recursos o aparelho CONECTADO tem.

     É a função mais importante deste módulo agora. O cabeçalho do SDK marca a
     leitura de HRV como "Only Ring Support", mas existem as flags
     `QCBandFeatureHRV` e `QCBandFeatureHRVInterval` — ou seja, quem decide é o
     firmware, não a documentação. Esta chamada responde empiricamente se a H59
     entrega HRV, que é a pergunta da qual depende o score de energia inteiro.
     */
    AsyncFunction("getFeatures") { (promise: Promise) in
      /*
       A lista de recursos vem no retorno de `setTime`, e não de uma consulta
       dedicada — não existe `getDeviceFeature` no SDK. É estranho à primeira
       vista e faz sentido no fluxo: acertar o relógio é a primeira coisa que se
       faz ao parear, então o fabricante aproveitou a resposta para declarar o
       que o firmware suporta.
       */
      QCSDKCmdCreator.setTime(Date(), success: { featureList in
        let features: [String: Any] = (featureList as? [String: Any]) ?? [:]
        promise.resolve(features)
      }, failed: {
        promise.reject("falha", "O aparelho não respondeu à consulta de recursos")
      })
    }

    AsyncFunction("startRealtimeHeartRate") { (promise: Promise) in
      QCSDKCmdCreator.beginRealTimeHeartRateSuccess({
        promise.resolve(nil)
      }, fail: {
        promise.reject("falha", "Não foi possível iniciar a medição")
      })
    }

    AsyncFunction("stopRealtimeHeartRate") { (promise: Promise) in
      // Falha ao parar é resolvida, não rejeitada: se o aparelho já parou
      // sozinho, insistir num erro só produziria ruído na interface.
      QCSDKCmdCreator.endRealTimeHeartRateSuccess({ promise.resolve(nil) }, fail: { promise.resolve(nil) })
    }

    /**
     HRV do dia. `dayIndex` 0 é hoje, 1 é ontem, e assim por diante.

     Devolve a série bruta, com o intervalo em segundos entre amostras — não uma
     média. O produto precisa da série para comparar a pessoa com ela mesma; uma
     média diária esconderia justamente a variação que interessa.
     */
    AsyncFunction("getHrv") { (dayIndex: Int, promise: Promise) in
      QCSDKCmdCreator.getSchedualHRVData(withDates: [NSNumber(value: dayIndex)]) { models, error in
        if let error = error {
          promise.reject("falha", error.localizedDescription)
          return
        }
        /*
         Montado passo a passo, com tipo anotado em cada variável.

         Literal de dicionário heterogêneo dentro de um `map` é o caso clássico
         em que o Swift estoura o orçamento de inferência e responde "failed to
         produce diagnostic for expression" — um erro que não aponta linha nem
         expressão, e por isso custa caro. Quebrar em variáveis tipadas custa
         quatro linhas e elimina a classe inteira do problema.
         */
        if let bruto = models as? NSArray {
          for item in bruto.prefix(3) {
          }
        } else {
        }
        let list: [QCHRVModel] = (models as? [QCHRVModel]) ?? []
        var series: [[String: Any]] = []
        for model in list {
          let values: [Int] = model.hrv.map { $0.intValue }
          let entry: [String: Any] = [
            "date": model.date,
            "secondInterval": model.secondInterval,
            "values": values,
          ]
          series.append(entry)
        }
        promise.resolve(series)
      }
    }

    /*
     FALTA AQUI: medir HRV sob demanda, em vez de só ler o histórico.

     O recurso existe — `QCMeasuringTypeHRV` no enum de tipos de medição do
     `QCSDKManager.h`, e o SDK Android confirma com `startHrvMeasure()`. Ficou
     de fora deste build de propósito.

     O motivo é o erro que derrubou o build anterior. O nome que o Swift importa
     para `startToMeasuringWithOperateType:measuringHandle:completedHandle:` não
     é determinável lendo o cabeçalho: depende de como o importador quebra
     `WithOperateType`, e um palpite errado dentro de uma expressão com duas
     closures produz exatamente "failed to produce diagnostic" — erro sem linha,
     que custa um ciclo inteiro de build para localizar.

     Entra assim que houver um build verde: com o framework compilado, o
     autocompletar do Xcode dá a assinatura exata, sem adivinhação. Enquanto
     isso o HRV vem do histórico, que é real, só não é sob demanda.
     */

    /**
     Manda a pulseira MEDIR agora, em vez de esperar a janela dela.

     É o que faltava para a tela inicial ter mais que batimento. O aparelho
     transmite frequência cardíaca continuamente, mas SpO₂, pressão, estresse e
     HRV só existem quando alguém pede — e ninguém pedia.

     O resultado NÃO sai do retorno desta chamada. Ele chega pelos blocos que
     `wireSDKCallbacks` já liga (`boMeasuring`, `bpMeasuring`, `hrMeasuring`),
     que é o caminho desenhado pelo fabricante: a medição leva dezenas de
     segundos e vai reportando. Aqui só interessa se o comando foi aceito.
     */
    AsyncFunction("measure") { (kind: String, promise: Promise) in
      guard let type = QCBandModule.measuringType(kind) else {
        promise.reject("tipo-invalido", "Medição desconhecida: \(kind)")
        return
      }
      QCSDKManager.shareInstance().startToMeasuring(
        withOperateType: type,
        measuringHandle: { [weak self] _ in
          // Parcial durante a medição: o valor vem pelos blocos do SDK, isto
          // serve para a tela mostrar que algo está acontecendo.
          let payload: [String: Any] = ["kind": "measuring", "type": kind]
          self?.sendEvent("onReading", payload)
        },
        completedHandle: { [weak self] isSuccess, result, error in
          if isSuccess {
            // O VALOR está aqui, não nos blocos.
            self?.emitMeasurement(kind: kind, result: result)
            promise.resolve(true)
            return
          }
          /*
           O motivo vem do UserInfo, não do `localizedDescription`.

           O firmware devolve a causa REAL em `UserInfo["message"]` — a que
           importa é "手环未正确佩戴": a pulseira não está fazendo contato com a
           pele. O `localizedDescription` de um NSError sem tabela de tradução
           vira "The operation couldn't be completed. (MeasuringError error
           -3.)", que não diz nada a ninguém e era tudo que chegava à tela.

           Passado adiante como veio, em `code`: quem traduz para o português e
           decide o que sugerir é o domínio, não a ponte.
          */
          let userInfo = (error as NSError?)?.userInfo
          let doFirmware = userInfo?["message"] as? String
          let motivo = doFirmware ?? error?.localizedDescription ?? "a medição não concluiu"
          promise.reject(doFirmware.map { _ in "firmware" } ?? "falha", motivo)
        }
      )
    }

    AsyncFunction("stopMeasure") { (kind: String, promise: Promise) in
      guard let type = QCBandModule.measuringType(kind) else {
        promise.resolve(nil)
        return
      }
      // Resolve mesmo em falha: se o aparelho já parou sozinho, insistir num
      // erro só produz ruído.
      QCSDKManager.shareInstance().stopToMeasuring(withOperateType: type) { _, _ in
        promise.resolve(nil)
      }
    }

    /**
     Pergunta à pulseira, de três formas, se ela mede temperatura.

     A lista de `getFeatures` desta unidade não traz o recurso, e eu quase
     concluí daí que o hardware não tem o sensor. Mas lista que omite não é o
     mesmo que hardware que não tem — e já errei nessa direção antes, afirmando
     que a pulseira não media HRV quando ela media.

     Então: histórico agendado, histórico manual e medição sob demanda. Se os
     três voltarem vazios, aí sim é ausência de sensor, dita pelo aparelho.
     */
    AsyncFunction("probeTemperature") { (promise: Promise) in
      QCSDKCmdCreator.getSchedualTemperatureData(byDayIndex: 0) { [weak self] lista, erro in
        let quantos: Int = (lista as? [Any])?.count ?? 0
        let detalhe: String = erro?.localizedDescription ?? "sem erro"
        self?.onLogFromModule?([
          "raw": "temperatura agendada: \(quantos) registros — \(detalhe) — \(String(describing: lista))",
        ])

        QCSDKCmdCreator.getManualTemperatureData(byDayIndex: 0) { [weak self] manual, erroManual in
          let quantosManual: Int = (manual as? [Any])?.count ?? 0
          let detalheManual: String = erroManual?.localizedDescription ?? "sem erro"
          self?.onLogFromModule?([
            "raw": "temperatura manual: \(quantosManual) registros — \(detalheManual) — \(String(describing: manual))",
          ])
          promise.resolve(["agendada": quantos, "manual": quantosManual])
        }
      }
    }

    /**
     Estado do monitoramento AGENDADO de estresse e HRV.

     Estas grandezas têm um liga/desliga no firmware, separado da capacidade.
     `getFeatures` diz que a pulseira SABE medir; este estado diz se ela está
     medindo. Desligada, a medição sob demanda volta vazia e o histórico nunca
     enche — que é exatamente o que estávamos vendo.

     Não estava em documentação: apareceu procurando "stress" no cabeçalho
     depois que a medição concluiu sem entregar valor.
     */
    AsyncFunction("getMonitoring") { (promise: Promise) in
      /*
       Os CINCO interruptores agendados, não dois.

       Estresse e HRV eram os únicos consultados, e por isso a pulseira só
       preenchia a memória deles. Pressão, oxigênio e frequência cardíaca têm
       interruptor próprio no firmware e chegam desligados — com eles fechados,
       ler o histórico devolve lista vazia por mais correto que o código de
       leitura esteja. Era a causa raiz da tela de oxigênio sem série nenhuma.

       Aninhado em vez de paralelo porque é UM canal serial: cinco consultas
       simultâneas disputam o mesmo rádio e o firmware responde fora de ordem.
      */
      QCSDKCmdCreator.getSchedualStressStatus { estresse, _ in
        QCSDKCmdCreator.getSchedualHRV { hrv, _ in
          QCSDKCmdCreator.getSchedualBPInfo({ pressaoLigada, _, _, _ in
            QCSDKCmdCreator.getSchedualBOInfoSuccess({ oxigenioLigado in
              QCSDKCmdCreator.getSchedualHeartRateStatus(success: { fcLigada in
                let estado: [String: Any] = [
                  "stress": estresse,
                  "hrv": hrv,
                  "bloodPressure": pressaoLigada,
                  "spo2": oxigenioLigado,
                  "heartRate": fcLigada,
                ]
                promise.resolve(estado)
              }, fail: {
                let estado: [String: Any] = [
                  "stress": estresse, "hrv": hrv,
                  "bloodPressure": pressaoLigada, "spo2": oxigenioLigado, "heartRate": false,
                ]
                promise.resolve(estado)
              })
            }, fail: {
              let estado: [String: Any] = [
                "stress": estresse, "hrv": hrv,
                "bloodPressure": pressaoLigada, "spo2": false, "heartRate": false,
              ]
              promise.resolve(estado)
            })
          }, fail: {
            let estado: [String: Any] = [
              "stress": estresse, "hrv": hrv,
              "bloodPressure": false, "spo2": false, "heartRate": false,
            ]
            promise.resolve(estado)
          })
        }
      }
    }

    AsyncFunction("setMonitoring") { (kind: String, enable: Bool, promise: Promise) in
      switch kind {
      case "stress":
        QCSDKCmdCreator.setSchedualStressStatus(enable) { _ in promise.resolve(nil) }
      case "hrv":
        QCSDKCmdCreator.setSchedualHRVStatus(enable) { _ in promise.resolve(nil) }
      case "bloodPressure":
        /*
         A janela é o dia inteiro, a cada 30 minutos.

         O firmware exige começo, fim e intervalo — não há forma de dizer só
         "ligado". Meia hora é o mesmo passo que o app do fabricante usa, e é o
         que produz a curva de 24 h sem gastar bateria a cada cinco minutos.
        */
        QCSDKCmdCreator.setSchedualBPInfoOn(
          enable, beginTime: "00:00", endTime: "23:59", minuteInterval: 30,
          success: { _, _, _, _ in promise.resolve(nil) },
          fail: { promise.resolve(nil) }
        )
      case "spo2":
        QCSDKCmdCreator.setSchedualBOInfoOn(
          enable,
          success: { _ in promise.resolve(nil) },
          fail: { promise.resolve(nil) }
        )
      case "heartRate":
        QCSDKCmdCreator.setSchedualHeartRateStatus(
          enable,
          success: { _ in promise.resolve(nil) },
          fail: { promise.resolve(nil) }
        )
      default:
        promise.resolve(nil)
      }
    }


    /**
     Lembretes de água — alarmes do FIRMWARE, um por horário.

     Ao contrário do sedentarismo (janela + intervalo), a água é alarme com
     hora marcada: cada índice é um slot, `ALARMOTHER` (2) liga e `ALARMCLOSE`
     (0) desliga. A pulseira vibra no horário com o celular em qualquer estado.
     */
    AsyncFunction("setWaterReminder") { (index: Int, time: String, days: [Int], enabled: Bool, promise: Promise) in
      QCBandModule.gravarLembreteAgua(index: index, time: time, days: days, enabled: enabled) { ok in
        if ok { promise.resolve(nil) } else { promise.reject("falha", "a pulseira recusou o lembrete de água") }
      }
    }

    AsyncFunction("getWaterReminder") { (index: Int, promise: Promise) in
      QCBandModule.lerLembreteAgua(index: index) { estado in
        if let estado { promise.resolve(estado) } else { promise.reject("indisponivel", "lembrete de água indisponível agora") }
      }
    }

    /**
     Lembrete de sedentarismo — a PULSEIRA vibra, sem app no meio.

     É o firmware quem conta o tempo parado e aciona o motor: funciona com o
     celular desligado, que é exatamente o que um alerta de sedentarismo
     precisa. O app só configura a janela e o intervalo.

     `repeat` na ordem do SDK: domingo → sábado, 1 liga o dia.
     */
    AsyncFunction("getSedentary") { (promise: Promise) in
      QCSDKCmdCreator.getSitLongRemindResult({ inicio, fim, dias, intervalo in
        let estado: [String: Any] = [
          "beginTime": inicio,
          "endTime": fim,
          "days": dias,
          "intervalMin": intervalo,
        ]
        promise.resolve(estado)
      }, fail: {
        promise.reject("indisponivel", "lembrete de sedentarismo indisponível agora")
      })
    }

    AsyncFunction("setSedentary") { (beginTime: String, endTime: String, days: [Int], intervalMin: Int, promise: Promise) in
      QCSDKCmdCreator.setBeginTime(
        beginTime,
        endTime: endTime,
        repeatModel: days as [NSNumber],
        timeInterval: UInt(max(1, min(255, intervalMin))),
        success: { promise.resolve(nil) },
        fail: { promise.reject("falha", "a pulseira recusou a configuração") }
      )
    }

    /**
     Frequência cardíaca do dia, medida pela pulseira nas janelas agendadas.

     Mesma forma do HRV: um ponto a cada `secondInterval` segundos, a partir da
     meia-noite da data. É o que permite a curva de 24 h aparecer assim que o
     app conecta, em vez de se construir ao vivo ao longo do dia — a série já
     está na memória do aparelho, só ninguém a lia.
     */
    AsyncFunction("getHeartRateHistory") { (dayIndex: Int, promise: Promise) in
      QCSDKCmdCreator.getSchedualHeartRateData(withDayIndexs: [NSNumber(value: dayIndex)], success: { models in
        // Tipado passo a passo: literal heterogêneo dentro de `map` estoura o
        // orçamento de inferência do Swift e produz erro sem linha.
        let list: [QCSchedualHeartRateModel] = models
        var series: [[String: Any]] = []
        for model in list {
          let values: [Int] = model.heartRates.map { $0.intValue }
          let entry: [String: Any] = [
            "date": model.date,
            "secondInterval": model.secondInterval,
            "values": values,
          ]
          series.append(entry)
        }
        promise.resolve(series)
      }, fail: {
        /*
         REJEITA, não resolve vazio.

         Resolver vazio aqui tornava "o SDK ainda não está pronto" idêntico a
         "o firmware não guarda isso" — e como a leitura roda logo após o
         `connected`, o primeiro caso é o comum. O histórico existia o tempo
         todo; o que faltava era o JS poder saber que devia tentar de novo.
        */
        promise.reject("indisponivel", "histórico de frequência cardíaca indisponível agora")
      })
    }

    /** Estresse do dia. Mesma forma do HRV e da frequência cardíaca. */
    AsyncFunction("getStressHistory") { (dayIndex: Int, promise: Promise) in
      QCSDKCmdCreator.getSchedualStressData(withDates: [NSNumber(value: dayIndex)]) { models, error in
        if let error = error {
          promise.reject("indisponivel", error.localizedDescription)
          return
        }
        let list: [QCStressModel] = (models as? [QCStressModel]) ?? []
        var series: [[String: Any]] = []
        for model in list {
          let values: [Int] = model.stresses.map { $0.intValue }
          let entry: [String: Any] = [
            "date": model.date,
            "secondInterval": model.secondInterval,
            "values": values,
          ]
          series.append(entry)
        }
        promise.resolve(series)
      }
    }

    /**
     Oxigenação do dia.

     Ao contrário do HRV, aqui cada amostra traz o próprio instante — o firmware
     mede em janelas irregulares, não em passo fixo. Por isso a forma é uma
     lista de pontos com carimbo, e não uma série com intervalo.

     `sourceType` separa a medição AGENDADA da que alguém pediu na mão. Vale
     manter a distinção: uma aferição sob demanda costuma ser feita parado, e
     misturá-la com a série agendada distorce a mínima do dia, que é justamente
     o número que importa em oxigenação.
     */
    AsyncFunction("getSpo2History") { (dayIndex: Int, promise: Promise) in
      QCSDKCmdCreator.getBloodOxygenData(byDayIndex: dayIndex) { models, error in
        if let error = error {
          promise.reject("indisponivel", error.localizedDescription)
          return
        }
        let list: [QCBloodOxygenModel] = (models as? [QCBloodOxygenModel]) ?? []
        var pontos: [[String: Any]] = []
        for model in list {
          let at: Double = model.date.timeIntervalSince1970 * 1000
          let entry: [String: Any] = [
            "at": at,
            "value": Double(model.soa2),
            "min": Double(model.minSoa2),
            "max": Double(model.maxSoa2),
            "manual": model.sourceType == 1,
          ]
          pontos.append(entry)
        }
        promise.resolve(pontos)
      }
    }

    /**
     Pressão arterial registrada pela pulseira.

     Sem `dayIndex`: o SDK devolve o histórico agendado inteiro de uma vez, e
     quem recorta por dia é o lado JS. Cada ponto traz o próprio instante.
     */
    AsyncFunction("getPressureHistory") { (promise: Promise) in
      QCSDKCmdCreator.getSchedualBPHistoryData(success: { models in
        let list: [QCBloodPressureModel] = models
        var pontos: [[String: Any]] = []
        for model in list {
          let at: Double = model.date.timeIntervalSince1970 * 1000
          let entry: [String: Any] = [
            "at": at,
            "systolic": model.systolicPressure,
            "diastolic": model.diastolicPressure,
          ]
          pontos.append(entry)
        }
        promise.resolve(pontos)
      }, fail: {
        promise.reject("indisponivel", "histórico de pressão indisponível agora")
      })
    }

    /**
     Passos do dia, fatiados ao longo das horas.

     `totalStepCount` de cada fatia é o que aconteceu NAQUELE trecho, não o
     acumulado — é isso que permite desenhar as barras por hora em vez de uma
     rampa sempre crescente. Distância vem em metros e calorias já em kcal.
     */
    AsyncFunction("getStepsHistory") { (dayIndex: Int, promise: Promise) in
      QCSDKCmdCreator.getSportDetailData(byDay: dayIndex, sportDatas: { models in
        let list: [QCSportModel] = models
        var pontos: [[String: Any]] = []
        for model in list {
          let entry: [String: Any] = [
            "at": model.happenDate,
            "steps": model.totalStepCount,
            "calories": model.calories,
            "distanceM": model.distance,
            "activeMin": model.activeTime,
          ]
          pontos.append(entry)
        }
        promise.resolve(pontos)
      }, fail: {
        promise.reject("indisponivel", "histórico de passos indisponível agora")
      })
    }

    /**
     Sono detalhado de um dia. `dayIndex` 0 é hoje, 1 é ontem.

     A pulseira MEDE sono e declara isso em `getFeatures`
     (`feature.newSleepProtocol`) desde o primeiro pareamento — passei por essa
     informação sem vê-la e fui buscar sono no HealthKit, que no aparelho desta
     pessoa está vazio. A fonte certa estava no pulso.

     Devolve os segmentos na ordem em que aconteceram, com tipo e duração. A
     ordem importa: é ela que revela a arquitetura da noite, com o profundo
     concentrado no início e o REM crescendo até o amanhecer.
     */
    AsyncFunction("getSleep") { (dayIndex: Int, promise: Promise) in
      QCSDKCmdCreator.getSleepDetailData(byDay: dayIndex, sleepDatas: { modelos in
        var segmentos: [[String: Any]] = []
        for m in modelos {
          /*
           Comparação por valor bruto, não pelo nome do caso.

           O enum `SLEEPTYPE` do fabricante não segue a convenção que o
           importador do Swift espera, e o nome que ele gera não é determinável
           lendo o cabeçalho. O número é estável e está documentado ali mesmo:
           1 acordado, 2 leve, 3 profundo, 4 REM. O 0 (sem dado) e o 5 (fora do
           pulso) não são sono e ficam de fora.
           */
          let tipo: Int = m.type.rawValue
          guard tipo >= 1, tipo <= 4, m.total > 0 else { continue }
          let segmento: [String: Any] = [
            "type": tipo,
            "minutes": m.total,
            "start": m.happenDate,
            "end": m.endTime,
          ]
          segmentos.append(segmento)
        }
        promise.resolve(segmentos)
      }, fail: {
        promise.reject("falha", "A pulseira não respondeu à consulta de sono")
      })
    }

    AsyncFunction("getBattery") { (promise: Promise) in
      QCSDKCmdCreator.readBatterySuccess({ battery, charging in
        let level: Int = Int(battery)
        let status: [String: Any] = ["level": level, "charging": charging]
        promise.resolve(status)
      }, failed: {
        promise.reject("falha", "Sem resposta de bateria")
      })
    }

    /**
     Faz a pulseira vibrar — o "localizar" de quem não lembra onde a deixou.

     Usa `alertBindingSuccess`, a vibração de confirmação de vínculo. Existe
     também `lookupDeviceSuccess` ("Find watch" no cabeçalho), que provavelmente
     é a vibração longa e repetida própria para localizar; nunca foi provada no
     aparelho, e trocar às cegas um comando que funciona por outro que talvez
     funcione custa uma rodada de teste com a pulseira na mão para descobrir.
     */
    AsyncFunction("findBand") { (promise: Promise) in
      QCSDKCmdCreator.alertBindingSuccess({
        promise.resolve(true)
      }, fail: {
        promise.reject("indisponivel", "pulseira não respondeu")
      })
    }

    /**
     Uma vibração curta AGORA, para um aviso nosso.

     Mesmo comando do `findBand` — é o único pulso de vibração que o SDK expõe
     e que está provado neste firmware. Os dois nomes existem porque os
     PROPÓSITOS são diferentes, e é o propósito que decide o que muda quando
     descobrirmos um comando melhor para cada um.

     Só serve com o app vivo e conectado. O aviso que chega com o app suspenso
     depende do ANCS, abaixo.
     */
    AsyncFunction("vibrate") { (promise: Promise) in
      QCSDKCmdCreator.alertBindingSuccess({
        promise.resolve(true)
      }, fail: {
        promise.reject("indisponivel", "pulseira não respondeu")
      })
    }

    /**
     Liga a bandeira de ANCS — o passo que faz o iOS oferecer o emparelhamento.

     Sem emparelhamento no nível do SISTEMA (o diálogo "deseja emparelhar?"), a
     pulseira não tem acesso ao Apple Notification Center Service e nenhuma
     notificação chega até ela, por mais que o filtro esteja ligado. Conexão
     pelo nosso app não substitui isso: são duas camadas diferentes.
     */
    AsyncFunction("enableAncs") { (promise: Promise) in
      QCSDKCmdCreator.setANCSFlagSuccess({
        promise.resolve(true)
      }, fail: {
        promise.reject("indisponivel", "a pulseira recusou a ativação do ANCS")
      })
    }

    /**
     O que a pulseira aceita notificar hoje, por categoria.

     Serve a dois propósitos: mostrar o estado na tela e SONDAR o firmware. O
     cabeçalho do SDK documenta um vocabulário fixo de categorias (telefone,
     SMS, WhatsApp, Instagram…) sem nenhum identificador de app, e é por isso
     que o AssumFit cai em `Others`. Se este firmware devolver algo fora do
     vocabulário, é aqui que aparece.
     */
    AsyncFunction("getNotificationFilter") { (promise: Promise) in
      QCSDKCmdCreator.getAppNotiFilterSuccess({ filtros in
        guard let filtros else {
          promise.resolve([])
          return
        }
        let lista: [[String: Any]] = filtros.map { f in
          ["type": f.appType.rawValue, "enabled": f.isOn]
        }
        promise.resolve(lista)
      }, failed: {
        promise.reject("indisponivel", "a pulseira não respondeu ao filtro de avisos")
      })
    }

    /**
     Liga ou desliga categorias no filtro.

     Recebe a lista INTEIRA, não um delta: o comando do firmware substitui o
     conjunto, e mandar só a categoria alterada apagaria as outras.
     */
    AsyncFunction("setNotificationFilter") { (entradas: [[String: Any]], promise: Promise) in
      let filtros: [QCFilterModel] = entradas.compactMap { entrada in
        guard
          let bruto = entrada["type"] as? Int,
          let tipo = QC_FILTER_APP_TYPE(rawValue: bruto)
        else { return nil }
        let modelo = QCFilterModel()
        modelo.appType = tipo
        modelo.isOn = (entrada["enabled"] as? Bool) ?? false
        return modelo
      }
      QCSDKCmdCreator.setAppNotiFilter(filtros, success: {
        promise.resolve(true)
      }, failed: {
        promise.reject("indisponivel", "a pulseira recusou o filtro de avisos")
      })
    }
  }
}



// MARK: - Lembrete de água (fora do DSL: erro de nome de seletor com linha)

extension QCBandModule {
  static func gravarLembreteAgua(index: Int, time: String, days: [Int], enabled: Bool, _ done: @escaping (Bool) -> Void) {
    let tipo: ALARMTYPE = enabled ? .ALARMOTHER : .ALARMCLOSE
    QCSDKCmdCreator.setDrinkWaterRemind(
      UInt(index),
      type: tipo,
      time: time,
      cycle: days as [NSNumber],
      success: { done(true) },
      failed: { done(false) }
    )
  }

  static func lerLembreteAgua(index: Int, _ done: @escaping ([String: Any]?) -> Void) {
    QCSDKCmdCreator.getDrinkWaterRemind(with: UInt(index), remind: { _, tipo, hora, dias in
      done(["enabled": tipo != .ALARMCLOSE, "time": hora, "days": dias])
    }, fail: {
      done(nil)
    })
  }
}

#else

/**
 A variante SEM rádio — simulador, ou qualquer build sem o framework.

 A classe precisa EXISTIR aqui porque o `ExpoModulesProvider` gerado a
 referencia por nome em qualquer build; e `isSupported() == false` é o que faz
 `services/ble/index.ts` cair no mock. O resto é superfície: cada função do
 ramo real existe com resposta vazia coerente, porque método ausente quebra o
 JS com "não é uma função" em vez de simplesmente não ter dado.

 NENHUMA linha deste ramo pode citar o SDK: o framework é arm64 puro de
 aparelho, e a referência que compila no device quebra o build de simulador —
 foi exatamente o que aconteceu quando este bloco era uma cópia do ramo real.
 */
public class QCBandModule: Module {
  public func definition() -> ModuleDefinition {
    Name("QCBand")

    Events("onDevice", "onState", "onReading", "onLog")

    Function("isSupported") { () -> Bool in false }

    AsyncFunction("startScan") { (promise: Promise) in
      promise.reject("sem-radio", "Bluetooth indisponível neste build")
    }
    AsyncFunction("stopScan") { (promise: Promise) in promise.resolve(nil) }
    AsyncFunction("connect") { (_: String, promise: Promise) in
      promise.reject("sem-radio", "Bluetooth indisponível neste build")
    }
    AsyncFunction("disconnect") { (promise: Promise) in promise.resolve(nil) }
    AsyncFunction("getFeatures") { (promise: Promise) in
      promise.resolve([String: Any]())
    }
    AsyncFunction("startRealtimeHeartRate") { (promise: Promise) in promise.resolve(nil) }
    AsyncFunction("stopRealtimeHeartRate") { (promise: Promise) in promise.resolve(nil) }
    AsyncFunction("getHrv") { (_: Int, promise: Promise) in
      promise.resolve([[String: Any]]())
    }
    AsyncFunction("measure") { (_: String, promise: Promise) in
      promise.reject("sem-radio", "não há sensor para medir neste build")
    }
    AsyncFunction("stopMeasure") { (_: String, promise: Promise) in promise.resolve(nil) }
    AsyncFunction("probeTemperature") { (promise: Promise) in
      promise.resolve(["agendada": 0, "manual": 0])
    }
    AsyncFunction("getMonitoring") { (promise: Promise) in
      let estado: [String: Any] = [
        "stress": false, "hrv": false, "bloodPressure": false, "spo2": false, "heartRate": false,
      ]
      promise.resolve(estado)
    }
    AsyncFunction("setMonitoring") { (_: String, _: Bool, promise: Promise) in
      promise.resolve(nil)
    }
    AsyncFunction("findBand") { (promise: Promise) in
      promise.reject("indisponivel", "sem radio no simulador")
    }
    AsyncFunction("vibrate") { (promise: Promise) in
      promise.reject("indisponivel", "sem radio no simulador")
    }
    AsyncFunction("enableAncs") { (promise: Promise) in
      promise.reject("indisponivel", "sem radio no simulador")
    }
    AsyncFunction("getNotificationFilter") { (promise: Promise) in
      promise.resolve([[String: Any]]())
    }
    AsyncFunction("setNotificationFilter") { (_: [[String: Any]], promise: Promise) in
      promise.reject("indisponivel", "sem radio no simulador")
    }
    AsyncFunction("getSleep") { (_: Int, promise: Promise) in
      promise.resolve([[String: Any]]())
    }
    AsyncFunction("getBattery") { (promise: Promise) in
      promise.resolve(["level": 0, "charging": false])
    }
    AsyncFunction("getHeartRateHistory") { (_: Int, promise: Promise) in
      promise.resolve([[String: Any]]())
    }
    AsyncFunction("getStressHistory") { (_: Int, promise: Promise) in
      promise.resolve([[String: Any]]())
    }
    AsyncFunction("getSpo2History") { (_: Int, promise: Promise) in
      promise.resolve([[String: Any]]())
    }
    AsyncFunction("getPressureHistory") { (promise: Promise) in
      promise.resolve([[String: Any]]())
    }
    AsyncFunction("getStepsHistory") { (_: Int, promise: Promise) in
      promise.resolve([[String: Any]]())
    }
    AsyncFunction("getSedentary") { (promise: Promise) in
      promise.reject("sem-radio", "sem pulseira neste build")
    }
    AsyncFunction("setSedentary") { (_: String, _: String, _: [Int], _: Int, promise: Promise) in
      promise.resolve(nil)
    }
    AsyncFunction("getWaterReminder") { (_: Int, promise: Promise) in
      promise.reject("sem-radio", "sem pulseira neste build")
    }
    AsyncFunction("setWaterReminder") { (_: Int, _: String, _: [Int], _: Bool, promise: Promise) in
      promise.resolve(nil)
    }
  }
}

#endif
