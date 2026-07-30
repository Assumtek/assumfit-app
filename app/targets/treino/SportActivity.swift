import ActivityKit
import SwiftUI
import WidgetKit

/**
 A sessão de esporte na Dynamic Island e na tela de bloqueio.

 O TIMER conta sozinho: o estado carrega `startedAt` e o sistema renderiza
 `Text(style: .timer)` sem o app precisar acordar a cada segundo — o app só
 manda update quando distância/batimento mudam ou ao pausar. É o que faz a
 ilha continuar viva com o app em segundo plano sem gastar bateria.

 A STRUCT DE ATRIBUTOS existe idêntica no WidgetBridge do app: o ActivityKit
 casa os dois processos pelo NOME do tipo e pela codificação JSON — divergiu
 um campo, a ilha simplesmente não aparece, sem erro em lugar nenhum.
 */
struct SportActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var startedAt: Date
    /// Presente = pausado; o timer congela e a ilha mostra o rótulo de pausa.
    var pausedAt: Date?
    var distanceKm: Double?
    var bpm: Int?
  }

  var sportLabel: String
}

private let acento = Color(red: 0x87 / 255, green: 0x7B / 255, blue: 0xF0 / 255)

@available(iOS 16.2, *)
struct SportLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: SportActivityAttributes.self) { context in
      // Tela de bloqueio / banner.
      HStack(spacing: 12) {
        Image(systemName: "figure.run")
          .font(.system(size: 22))
          .foregroundStyle(acento)
        VStack(alignment: .leading, spacing: 2) {
          Text(context.attributes.sportLabel)
            .font(.system(size: 13, weight: .semibold))
          Cronometro(state: context.state)
            .font(.system(size: 26, weight: .bold, design: .rounded))
        }
        Spacer()
        Metricas(state: context.state)
      }
      .padding(14)
      .activityBackgroundTint(Color(red: 0x0E / 255, green: 0x0A / 255, blue: 0x22 / 255))
      .activitySystemActionForegroundColor(acento)

    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            Image(systemName: "figure.run").foregroundStyle(acento)
            Text(context.attributes.sportLabel).font(.system(size: 13, weight: .semibold))
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Metricas(state: context.state)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Cronometro(state: context.state)
            .font(.system(size: 34, weight: .bold, design: .rounded))
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
        }
      } compactLeading: {
        Image(systemName: "figure.run").foregroundStyle(acento)
      } compactTrailing: {
        Cronometro(state: context.state)
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .frame(maxWidth: 52)
      } minimal: {
        Image(systemName: "figure.run").foregroundStyle(acento)
      }
    }
  }
}

/// Contagem viva quando correndo; congelada (e cinza) quando pausado.
@available(iOS 16.2, *)
private struct Cronometro: View {
  let state: SportActivityAttributes.ContentState

  var body: some View {
    if let pausa = state.pausedAt {
      Text(formatado(desde: state.startedAt, ate: pausa))
        .foregroundStyle(.secondary)
    } else {
      Text(state.startedAt, style: .timer)
        .monospacedDigit()
    }
  }

  private func formatado(desde: Date, ate: Date) -> String {
    let s = Int(ate.timeIntervalSince(desde))
    let h = s / 3600, m = (s % 3600) / 60, seg = s % 60
    return h > 0
      ? String(format: "%d:%02d:%02d", h, m, seg)
      : String(format: "%d:%02d", m, seg)
  }
}

@available(iOS 16.2, *)
private struct Metricas: View {
  let state: SportActivityAttributes.ContentState

  var body: some View {
    VStack(alignment: .trailing, spacing: 2) {
      if let km = state.distanceKm {
        Text(String(format: "%.2f km", km).replacingOccurrences(of: ".", with: ","))
          .font(.system(size: 13, weight: .semibold))
      }
      if let bpm = state.bpm {
        HStack(spacing: 3) {
          Image(systemName: "heart.fill").font(.system(size: 9)).foregroundStyle(acento)
          Text("\(bpm)").font(.system(size: 13, weight: .semibold))
        }
      }
    }
  }
}
