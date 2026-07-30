import ExpoModulesCore
import WidgetKit

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
  }
}
