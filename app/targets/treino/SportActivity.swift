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
    /// Presente = contagem REGRESSIVA até aqui (sessão de foco); ausente = progressiva.
    var endsAt: Date?
    /// Fase corrente ("FOCO"/"PAUSA") — só o foco usa.
    var phase: String?
  }

  var sportLabel: String
  /// SF Symbol da atividade — "figure.run" no esporte, "brain.head.profile" no foco.
  var symbol: String
}

private let acento = Color(red: 0x87 / 255, green: 0x7B / 255, blue: 0xF0 / 255)

@available(iOS 16.2, *)
struct SportLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: SportActivityAttributes.self) { context in
      // Tela de bloqueio / banner.
      HStack(spacing: 12) {
        Image(systemName: context.attributes.symbol)
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
        if #available(iOS 17.0, *) {
          Botoes(state: context.state)
        }
      }
      .padding(14)
      .activityBackgroundTint(Color(red: 0x0E / 255, green: 0x0A / 255, blue: 0x22 / 255))
      .activitySystemActionForegroundColor(acento)

    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            Image(systemName: context.attributes.symbol).foregroundStyle(acento)
            Text(context.state.phase ?? context.attributes.sportLabel)
              .font(.system(size: 13, weight: .semibold))
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          Metricas(state: context.state)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack(spacing: 12) {
            Cronometro(state: context.state)
              .font(.system(size: 30, weight: .bold, design: .rounded))
            Spacer(minLength: 0)
            if #available(iOS 17.0, *) {
              Botoes(state: context.state)
            }
          }
          .padding(.top, 4)
        }
      } compactLeading: {
        Image(systemName: context.attributes.symbol).foregroundStyle(acento)
      } compactTrailing: {
        Cronometro(state: context.state)
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .frame(maxWidth: 52)
      } minimal: {
        Image(systemName: context.attributes.symbol).foregroundStyle(acento)
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
    } else if let fim = state.endsAt {
      // Foco: regressiva até o fim da fase — o sistema conta sozinho.
      Text(timerInterval: Date()...max(Date(), fim), countsDown: true)
        .monospacedDigit()
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

/**
 Pausar/retomar e encerrar sem abrir o app. `Button(intent:)` é o único jeito
 de uma Live Activity executar algo — o sistema roda o intent no processo do
 app (ver `SportControlIntents.swift`); por isso os botões só existem no
 iOS 17+, onde o mecanismo nasceu.
 */
@available(iOS 17.0, *)
private struct Botoes: View {
  let state: SportActivityAttributes.ContentState

  var body: some View {
    HStack(spacing: 10) {
      Button(intent: AlternarPausaEsporteIntent()) {
        Image(systemName: state.pausedAt == nil ? "pause.fill" : "play.fill")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(acento)
          .frame(width: 40, height: 40)
          .background(acento.opacity(0.18), in: Circle())
      }
      .buttonStyle(.plain)

      Button(intent: EncerrarEsporteIntent()) {
        Image(systemName: "stop.fill")
          .font(.system(size: 15, weight: .semibold))
          .foregroundStyle(.secondary)
          .frame(width: 40, height: 40)
          .background(Color.secondary.opacity(0.15), in: Circle())
      }
      .buttonStyle(.plain)
    }
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
