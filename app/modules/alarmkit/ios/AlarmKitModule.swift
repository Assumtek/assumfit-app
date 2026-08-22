import ExpoModulesCore
import SwiftUI

#if canImport(AlarmKit)
import AlarmKit
#endif

/**
 O despertador do planejador de sono, marcado pelo próprio app.

 Um testador (21/08/2026, build 7) tocou em "Abrir Relógio" e nada aconteceu —
 o esquema `clock-alarm://` não abre nada no iOS 26 e a falha era engolida. A
 resposta certa não é consertar o atalho: desde o iOS 26 existe o AlarmKit, e
 um app pode marcar o alarme de verdade, com permissão explícita da pessoa e
 com a tela de alarme do sistema (som, "Parar", aparece até no modo Foco).

 Abaixo do iOS 26 o módulo responde `unsupported`, e o JS volta ao caminho de
 abrir o Relógio — agora avisando quando não consegue.
 */
public class AlarmKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AlarmKitBridge")

    /** Verdadeiro a partir do iOS 26, onde o AlarmKit existe. */
    Function("isSupported") { () -> Bool in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) { return true }
      #endif
      return false
    }

    /**
     Marca um alarme para a PRÓXIMA ocorrência de `hour:minute` (hoje, se ainda
     não passou; senão amanhã). Resolve com:
     - "scheduled" — marcado;
     - "denied" — a pessoa recusou a permissão (ou já tinha recusado);
     - "unsupported" — iOS anterior ao 26.
     Rejeita só em erro do sistema, com a mensagem dele.
     */
    AsyncFunction("schedule") { (hour: Int, minute: Int, title: String, promise: Promise) in
      #if canImport(AlarmKit)
      guard #available(iOS 26.0, *) else {
        promise.resolve("unsupported")
        return
      }
      Task {
        do {
          let resultado = try await Despertador.marcar(hour: hour, minute: minute, title: title)
          promise.resolve(resultado)
        } catch {
          promise.reject("alarmkit", "\(error)")
        }
      }
      #else
      promise.resolve("unsupported")
      #endif
    }
  }
}

#if canImport(AlarmKit)
/// O AlarmKit exige um tipo de metadados, mesmo vazio. É a chave pela qual o
/// sistema identifica os alarmes DESTE app.
@available(iOS 26.0, *)
struct MetadadosDoAssumFit: AlarmMetadata {}

@available(iOS 26.0, *)
enum Despertador {
  private static let acento = Color(red: 0x87 / 255, green: 0x7B / 255, blue: 0xF0 / 255)

  static func marcar(hour: Int, minute: Int, title: String) async throws -> String {
    let manager = AlarmManager.shared

    var estado = manager.authorizationState
    if estado == .notDetermined {
      estado = try await manager.requestAuthorization()
    }
    guard estado == .authorized else { return "denied" }

    // Próxima ocorrência do horário, no calendário local.
    let calendario = Calendar.current
    var componentes = calendario.dateComponents([.year, .month, .day], from: Date())
    componentes.hour = hour
    componentes.minute = minute
    componentes.second = 0
    guard var quando = calendario.date(from: componentes) else { return "denied" }
    if quando <= Date() {
      quando = calendario.date(byAdding: .day, value: 1, to: quando) ?? quando
    }

    let alerta = AlarmPresentation.Alert(
      title: LocalizedStringResource(String.LocalizationValue(title)),
      stopButton: AlarmButton(text: "Parar", textColor: .white, systemImageName: "stop.fill")
    )
    let atributos = AlarmAttributes<MetadadosDoAssumFit>(
      presentation: AlarmPresentation(alert: alerta),
      metadata: MetadadosDoAssumFit(),
      tintColor: acento
    )
    let configuracao = AlarmManager.AlarmConfiguration<MetadadosDoAssumFit>(
      schedule: .fixed(quando),
      attributes: atributos
    )
    _ = try await manager.schedule(id: UUID(), configuration: configuracao)
    return "scheduled"
  }
}
#endif
