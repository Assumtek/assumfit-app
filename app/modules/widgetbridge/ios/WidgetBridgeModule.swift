import ActivityKit
import ExpoModulesCore
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
  }

  var sportLabel: String
}

/// A atividade corrente. Uma por vez: sessão de esporte não se sobrepõe.
@available(iOS 16.2, *)
private enum AtividadeCorrente {
  static var ativa: Activity<SportActivityAttributes>?
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

  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

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

    /** Limpa. Usado ao sair da conta — o widget não pode sobreviver ao logout. */
    Function("clear") { () -> Void in
      guard let defaults = UserDefaults(suiteName: self.suite) else { return }
      defaults.removeObject(forKey: self.chave)
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
    Function("startSportActivity") { (label: String, startedAtMs: Double) -> Bool in
      guard #available(iOS 16.2, *) else { return false }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
      let estado = SportActivityAttributes.ContentState(
        startedAt: Date(timeIntervalSince1970: startedAtMs / 1000),
        pausedAt: nil, distanceKm: nil, bpm: nil
      )
      do {
        AtividadeCorrente.ativa = try Activity.request(
          attributes: SportActivityAttributes(sportLabel: label),
          content: .init(state: estado, staleDate: nil)
        )
        return true
      } catch {
        return false
      }
    }

    Function("updateSportActivity") { (startedAtMs: Double, pausedAtMs: Double?, distanceKm: Double?, bpm: Int?) -> Void in
      guard #available(iOS 16.2, *), let ativa = AtividadeCorrente.ativa else { return }
      let estado = SportActivityAttributes.ContentState(
        startedAt: Date(timeIntervalSince1970: startedAtMs / 1000),
        pausedAt: pausedAtMs.map { Date(timeIntervalSince1970: $0 / 1000) },
        distanceKm: distanceKm,
        bpm: bpm
      )
      Task { await ativa.update(.init(state: estado, staleDate: nil)) }
    }

    Function("endSportActivity") { () -> Void in
      guard #available(iOS 16.2, *), let ativa = AtividadeCorrente.ativa else { return }
      AtividadeCorrente.ativa = nil
      Task { await ativa.end(nil, dismissalPolicy: .immediate) }
    }
  }
}
