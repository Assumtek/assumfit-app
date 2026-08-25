import ActivityKit
import ExpoModulesCore
import UIKit
import WidgetKit

/**
 CÓPIA FIEL da struct do target do widget (targets/treino/SportActivity.swift).

 O ActivityKit casa o app e a ilha pelo NOME do tipo e pela codificação JSON.
 Divergiu um campo entre as duas cópias, a ilha não aparece — sem erro em
 lugar nenhum. Mexeu numa, mexa na outra.
 */
struct SportActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var startedAt: Date
    var pausedAt: Date?
    var distanceKm: Double?
    var bpm: Int?
    var endsAt: Date?
    var phase: String?
  }

  var sportLabel: String
  var symbol: String
}

/// A atividade corrente. Uma por vez: sessão de esporte não se sobrepõe.
@available(iOS 16.2, *)
private enum AtividadeCorrente {
  static var ativa: Activity<SportActivityAttributes>?

  /**
   A atividade viva, mesmo quando esta referência se perdeu.

   `ativa` é memória do PROCESSO e a Live Activity é do SISTEMA: ela sobrevive
   ao app ser morto e continua na tela de bloqueio por horas. Depois de um
   encerramento forçado a referência volta nula com a atividade ainda lá, e sem
   consultar o `ActivityKit` ninguém mais consegue encerrá-la nem atualizá-la.
  */
  @available(iOS 16.2, *)
  static var viva: Activity<SportActivityAttributes>? {
    ativa ?? Activity<SportActivityAttributes>.activities.first
  }

  /**
   Encerra TODAS as atividades deste tipo, inclusive as órfãs.

   Um testador acumulou quatro cartões do mesmo treino empilhados na tela de
   bloqueio, três deles parados (Bruno, 24/08/2026). Cada abertura do treino
   criava uma nova, e as anteriores, sem referência viva no processo, não
   tinham como ser encerradas. Encerrar pela lista do sistema é o que alcança
   as de sessões passadas.
  */
  @available(iOS 16.2, *)
  static func encerrarTodas() {
    ativa = nil
    for atividade in Activity<SportActivityAttributes>.activities {
      Task { await atividade.end(nil, dismissalPolicy: .immediate) }
    }
  }
}

/**
 Escreve o que o widget lê.

 O widget roda em OUTRO PROCESSO, com sandbox próprio: ele não enxerga o
 armazenamento do app, não tem sessão e não pode chamar a API. O App Group é a
 única superfície compartilhada entre os dois no iOS — por isso este módulo
 existe, e por isso ele é a única coisa que o app precisa fazer para o widget
 funcionar.

 `reloadAllTimelines` é o que faz a mudança APARECER. Sem ele o widget só
 atualizaria na próxima janela que o sistema conceder, que pode ser horas
 depois — e a pessoa veria o treino de ontem depois de abrir o app hoje.
 */
public class WidgetBridgeModule: Module {
  /// Precisa bater exatamente com o `group` do `expo-target.config.js`.
  private let suite = "group.br.com.assumtek.assumfit.widget"
  private let chave = "treinoDeHoje"
  /// Fila escrita pelos intents dos botões da ilha (`SportControlIntents.swift`).
  private let chaveDeAcoes = "acoesDaIlha"
  private var observador: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    Events("onSportAction")

    // O intent do botão roda NESTE processo e avisa por NotificationCenter;
    // daqui vira evento de JS. O evento é só a campainha — o dado de verdade
    // fica na fila do App Group, que sobrevive ao JS suspenso.
    OnStartObserving {
      self.observador = NotificationCenter.default.addObserver(
        forName: Notification.Name("assumfit.ilha.acao"), object: nil, queue: nil
      ) { [weak self] aviso in
        guard
          let acao = aviso.userInfo?["action"] as? String,
          let atMs = aviso.userInfo?["atMs"] as? Double
        else { return }
        self?.sendEvent("onSportAction", ["action": acao, "atMs": atMs])
      }
    }

    OnStopObserving {
      if let observador = self.observador {
        NotificationCenter.default.removeObserver(observador)
      }
      self.observador = nil
    }

    /**
     Drena a fila de ações dos botões da ilha — devolve e APAGA, numa chamada
     só, para a mesma pausa nunca ser aplicada duas vezes.
     */
    Function("consumeSportActions") { () -> [[String: Any]] in
      guard let defaults = UserDefaults(suiteName: self.suite) else { return [] }
      let fila = defaults.array(forKey: self.chaveDeAcoes) as? [[String: Any]] ?? []
      defaults.removeObject(forKey: self.chaveDeAcoes)
      return fila
    }

    /** Se há App Group configurado. Falso em build sem o entitlement. */
    Function("isSupported") { () -> Bool in
      UserDefaults(suiteName: self.suite) != nil
    }

    /**
     Guarda o treino do dia como JSON e recarrega o widget.

     Recebe JSON já serializado em vez de um dicionário: a forma do dado é
     decidida pelo Swift do widget, que faz `JSONDecoder` em cima. Passar um
     dicionário obrigaria os dois lados a concordarem sobre tipos do Expo, e a
     divergência apareceria como widget vazio, sem erro em lugar nenhum.
    */
    Function("setTodayWorkout") { (json: String) -> Void in
      guard let defaults = UserDefaults(suiteName: self.suite) else { return }
      defaults.set(json, forKey: self.chave)
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    /**
     A água de hoje para o widget de água (`targets/treino/AguaWidget.swift`).
     JSON já serializado, pela mesma razão do treino: a forma é do Swift do
     widget. Recarrega só a linha do tempo da água — a do treino não mudou.
     */
    Function("setTodayWater") { (json: String) -> Void in
      guard let defaults = UserDefaults(suiteName: self.suite) else { return }
      defaults.set(json, forKey: "aguaDeHoje")
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadTimelines(ofKind: "AguaWidget")
      }
    }

    /**
     Os goles registrados pelo botão do widget desde a última vez — devolve e
     APAGA numa chamada só, para o mesmo copo nunca entrar duas vezes.
     */
    Function("consumeWaterPours") { () -> [[String: Any]] in
      guard let defaults = UserDefaults(suiteName: self.suite) else { return [] }
      let fila = defaults.array(forKey: "golesDoWidget") as? [[String: Any]] ?? []
      defaults.removeObject(forKey: "golesDoWidget")
      return fila
    }

    /**
     O Instagram consegue receber uma story deste aparelho?

     `canOpenURL` só responde a verdade para esquemas declarados em
     `LSApplicationQueriesSchemes` (o `instagram-stories` no `app.json`). Sem a
     declaração ele devolve `false` sempre, e o botão simplesmente nunca
     apareceria: falso negativo, não falha.
    */
    Function("podeAbrirInstagramStories") { () -> Bool in
      guard let url = URL(string: "instagram-stories://share") else { return false }
      return UIApplication.shared.canOpenURL(url)
    }

    /**
     Abre o Instagram Stories já com a imagem como fundo.

     Pedido de testador (Bruno, 24/08/2026): "vincular botão direto com o
     Instagram, pra facilitar o post". O caminho oficial não é um `share`
     comum: a imagem vai para o pasteboard sob a CHAVE que o Instagram procura,
     e só então o esquema é aberto. Por isso isto é nativo e não sai de
     `expo-sharing`, que entrega um arquivo genérico e faz o Instagram abrir na
     tela de escolher mídia.

     O item do pasteboard expira em cinco minutos: é conteúdo da pessoa, e
     deixá-lo na área de transferência do aparelho depois do post seria vazar
     uma imagem para qualquer app que a leia.
    */
    Function("abrirInstagramStories") { (caminho: String) -> Bool in
      guard let url = URL(string: "instagram-stories://share?source_application=\(Bundle.main.bundleIdentifier ?? "")"),
            UIApplication.shared.canOpenURL(url) else { return false }

      // `captureRef` devolve `file://…`; `URL(string:)` só entende a forma com
      // esquema, e o caminho cru precisa de `fileURLWithPath`.
      let arquivo = caminho.hasPrefix("file://") ? URL(string: caminho) : URL(fileURLWithPath: caminho)
      guard let arquivo, let dados = try? Data(contentsOf: arquivo) else { return false }

      UIPasteboard.general.setItems(
        [["com.instagram.sharedSticker.backgroundImage": dados]],
        options: [.expirationDate: Date().addingTimeInterval(300)]
      )
      DispatchQueue.main.async { UIApplication.shared.open(url) }
      return true
    }

    /** Limpa. Usado ao sair da conta — o widget não pode sobreviver ao logout. */
    Function("clear") { () -> Void in
      guard let defaults = UserDefaults(suiteName: self.suite) else { return }
      defaults.removeObject(forKey: self.chave)
      defaults.removeObject(forKey: "aguaDeHoje")
      defaults.removeObject(forKey: "golesDoWidget")
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
      }
    }

    /**
     A sessão de esporte na Dynamic Island.

     `startedAtMs` em epoch: o timer da ilha conta SOZINHO a partir dele — o
     app não precisa mandar tique nenhum, só distância/batimento quando mudam.
     Devolve `false` quando a pessoa desligou Live Activities nos Ajustes.
     */
    Function("startSportActivity") { (label: String, symbol: String, startedAtMs: Double, endsAtMs: Double?) -> Bool in
      guard #available(iOS 16.2, *) else { return false }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
      // Ação de uma sessão anterior não pode vazar para a nova.
      UserDefaults(suiteName: self.suite)?.removeObject(forKey: self.chaveDeAcoes)
      // Nem a ATIVIDADE anterior. Sem isto, cada abertura do treino empilha um
      // cartão novo na tela de bloqueio e os antigos ficam lá, parados.
      AtividadeCorrente.encerrarTodas()
      let estado = SportActivityAttributes.ContentState(
        startedAt: Date(timeIntervalSince1970: startedAtMs / 1000),
        pausedAt: nil, distanceKm: nil, bpm: nil,
        endsAt: endsAtMs.map { Date(timeIntervalSince1970: $0 / 1000) },
        phase: nil
      )
      do {
        AtividadeCorrente.ativa = try Activity.request(
          attributes: SportActivityAttributes(sportLabel: label, symbol: symbol),
          content: .init(state: estado, staleDate: nil)
        )
        return true
      } catch {
        return false
      }
    }

    Function("updateSportActivity") { (startedAtMs: Double, pausedAtMs: Double?, distanceKm: Double?, bpm: Int?, endsAtMs: Double?, phase: String?) -> Void in
      // `viva` e não `ativa`: reabrir o app no meio de um treino perde a
      // referência do processo, e a atividade continua na tela de bloqueio.
      // Sem isto ela ficaria congelada no estado em que o app morreu.
      guard #available(iOS 16.2, *), let ativa = AtividadeCorrente.viva else { return }
      AtividadeCorrente.ativa = ativa
      let estado = SportActivityAttributes.ContentState(
        startedAt: Date(timeIntervalSince1970: startedAtMs / 1000),
        pausedAt: pausedAtMs.map { Date(timeIntervalSince1970: $0 / 1000) },
        distanceKm: distanceKm,
        bpm: bpm,
        endsAt: endsAtMs.map { Date(timeIntervalSince1970: $0 / 1000) },
        phase: phase
      )
      Task { await ativa.update(.init(state: estado, staleDate: nil)) }
    }

    Function("endSportActivity") { () -> Void in
      guard #available(iOS 16.2, *) else { return }
      // Todas, não só a referenciada: encerrar o treino é o momento certo para
      // limpar também o que sobrou de sessões que o app não viu terminar.
      AtividadeCorrente.encerrarTodas()
    }
  }
}
