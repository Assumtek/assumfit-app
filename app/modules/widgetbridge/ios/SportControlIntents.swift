import ActivityKit
import AppIntents
import Foundation

/**
 Os botões da Dynamic Island — pausar/retomar e encerrar.

 CÓPIA FIEL em `targets/treino/` e em `modules/widgetbridge/ios/`, pela mesma
 razão da struct de atributos: o widget precisa do TIPO para desenhar o botão,
 e o app precisa dele para EXECUTAR o toque — `LiveActivityIntent` roda no
 processo do app, que o sistema acorda em segundo plano se preciso. O casamento
 é pelo nome do tipo; mexeu numa cópia, mexa na outra.

 O toque faz duas coisas, nessa ordem:
 1. Ajusta a ilha NA HORA, em nativo — o JS pode estar suspenso, e o congelar
    do cronômetro não pode esperar o app voltar à frente.
 2. Grava a ação numa fila no App Group. A tela drena a fila quando acorda e
    aplica no estado dela (pausas descontadas, sessão salva) — é o que impede
    o cronômetro do app e o da ilha de contarem tempos diferentes.
 */
@available(iOS 17.0, *)
struct AlternarPausaEsporteIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Pausar ou retomar"
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    await ControleDaIlha.alternarPausa()
    return .result()
  }
}

@available(iOS 17.0, *)
struct EncerrarEsporteIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Encerrar sessão"
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    await ControleDaIlha.encerrar()
    return .result()
  }
}

@available(iOS 16.2, *)
enum ControleDaIlha {
  private static let suite = "group.br.com.assumtek.assumfit.widget"
  private static let chaveDeAcoes = "acoesDaIlha"
  /// Aviso EM PROCESSO (o intent roda no app): o WidgetBridge repassa ao JS.
  static let avisoDeAcao = Notification.Name("assumfit.ilha.acao")

  /**
   Pausa e retomada seguem a MESMA convenção que o lado JS usa ao atualizar a
   ilha (ver `SportScreen`/`FocusScreen`): o cronômetro congelado mostra
   início→pausa, então na contagem REGRESSIVA (foco, `phase` presente) o
   início é recuado pelo restante — e é desse recuo que a retomada o recupera.
   */
  static func alternarPausa() async {
    guard let ativa = Activity<SportActivityAttributes>.activities.first else { return }
    var estado = ativa.content.state
    let agora = Date()
    let acao: String

    if let pausa = estado.pausedAt {
      if estado.phase != nil {
        let resta = max(pausa.timeIntervalSince(estado.startedAt), 0)
        estado.endsAt = agora.addingTimeInterval(resta)
        estado.startedAt = agora
      } else {
        estado.startedAt = estado.startedAt.addingTimeInterval(agora.timeIntervalSince(pausa))
      }
      estado.pausedAt = nil
      acao = "resume"
    } else {
      if let fim = estado.endsAt {
        estado.startedAt = agora.addingTimeInterval(-max(fim.timeIntervalSince(agora), 0))
        estado.endsAt = nil
      }
      estado.pausedAt = agora
      acao = "pause"
    }

    await ativa.update(.init(state: estado, staleDate: nil))
    registrar(acao, em: agora)
  }

  static func encerrar() async {
    guard let ativa = Activity<SportActivityAttributes>.activities.first else { return }
    let agora = Date()
    await ativa.end(ativa.content, dismissalPolicy: .immediate)
    registrar("end", em: agora)
  }

  private static func registrar(_ acao: String, em instante: Date) {
    let atMs = instante.timeIntervalSince1970 * 1000
    if let defaults = UserDefaults(suiteName: suite) {
      var fila = defaults.array(forKey: chaveDeAcoes) as? [[String: Any]] ?? []
      fila.append(["action": acao, "atMs": atMs])
      defaults.set(fila, forKey: chaveDeAcoes)
    }
    NotificationCenter.default.post(
      name: avisoDeAcao, object: nil, userInfo: ["action": acao, "atMs": atMs]
    )
  }
}
