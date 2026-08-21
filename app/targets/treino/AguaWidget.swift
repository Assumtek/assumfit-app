import AppIntents
import SwiftUI
import WidgetKit

/**
 A água de hoje na tela de início — com um botão que registra sem abrir o app.

 Pedido de um testador (21/08/2026): "tem como registrar a água sem abrir o
 app, tipo um widget?". Tem, e é este. O total e a meta vêm do App Group, que o
 app escreve a cada gole; o botão é um `AppIntent` interativo (iOS 17), que
 roda NESTE processo, soma um copo no App Group e enfileira o gole para o app
 absorver quando voltar ao primeiro plano — é assim que o registro feito aqui
 chega ao servidor e ao histórico.

 O dado carrega a DATA: um widget que mostra a água de ontem às 9h da manhã
 mente com confiança. Se a data não é hoje, o total é zero — igual ao app.
 */

private let grupo = "group.br.com.assumtek.assumfit.widget"
private let chaveAgua = "aguaDeHoje"
private let chaveGoles = "golesDoWidget"
private let kind = "AguaWidget"

struct AguaDeHoje: Codable {
    var ml: Int
    let metaMl: Int
    let copoMl: Int
    /// `yyyy-MM-dd` no calendário local de quem escreveu.
    var data: String
    var gravadoEm: Double
}

private func hojeISO() -> String {
    let f = DateFormatter()
    f.calendar = Calendar.current
    f.timeZone = TimeZone.current
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: Date())
}

private func lerAgua() -> AguaDeHoje? {
    guard let defaults = UserDefaults(suiteName: grupo),
          let json = defaults.string(forKey: chaveAgua),
          let dados = json.data(using: .utf8),
          var agua = try? JSONDecoder().decode(AguaDeHoje.self, from: dados) else { return nil }
    // Virou o dia desde a última escrita do app: o total é de ontem.
    if agua.data != hojeISO() {
        agua.ml = 0
        agua.data = hojeISO()
    }
    return agua
}

private func gravarAgua(_ agua: AguaDeHoje) {
    guard let defaults = UserDefaults(suiteName: grupo),
          let dados = try? JSONEncoder().encode(agua),
          let json = String(data: dados, encoding: .utf8) else { return }
    defaults.set(json, forKey: chaveAgua)
}

/**
 O botão "+ copo". Roda no processo do widget; o app não precisa estar vivo.

 Duas escritas, nessa ordem: o total (para o widget redesenhar na hora) e a
 fila de goles (para o app gravar no servidor quando acordar). Sem a fila, o
 registro viveria só no widget e sumiria na próxima sincronização.
 */
@available(iOS 17.0, *)
struct RegistrarAguaIntent: AppIntent {
    static var title: LocalizedStringResource = "Registrar um copo de água"
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult {
        guard var agua = lerAgua() else { return .result() }
        agua.ml += agua.copoMl
        agua.gravadoEm = Date().timeIntervalSince1970
        gravarAgua(agua)

        if let defaults = UserDefaults(suiteName: grupo) {
            var fila = defaults.array(forKey: chaveGoles) as? [[String: Any]] ?? []
            fila.append(["ml": agua.copoMl, "atMs": Date().timeIntervalSince1970 * 1000])
            defaults.set(fila, forKey: chaveGoles)
        }
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
        return .result()
    }
}

struct EntradaDeAgua: TimelineEntry {
    let date: Date
    let agua: AguaDeHoje?
}

struct ProvedorDeAgua: TimelineProvider {
    func placeholder(in context: Context) -> EntradaDeAgua {
        EntradaDeAgua(date: Date(), agua: AguaDeHoje(ml: 1200, metaMl: 2500, copoMl: 200, data: hojeISO(), gravadoEm: Date().timeIntervalSince1970))
    }

    func getSnapshot(in context: Context, completion: @escaping (EntradaDeAgua) -> Void) {
        completion(EntradaDeAgua(date: Date(), agua: lerAgua()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<EntradaDeAgua>) -> Void) {
        // Como o de treino: recarrega na virada do dia, que é quando o total
        // zera. Cada gole recarrega por conta própria (app ou intent).
        let agora = Date()
        let amanha = Calendar.current.startOfDay(for: agora.addingTimeInterval(86400))
        completion(Timeline(entries: [EntradaDeAgua(date: agora, agua: lerAgua())], policy: .after(amanha)))
    }
}

// A mesma paleta fixa do widget de treino — o widget não tem acesso ao tema.
private let acento = Color(red: 0x87 / 255, green: 0x7B / 255, blue: 0xF0 / 255)
private let tinta = Color(red: 0x0E / 255, green: 0x0A / 255, blue: 0x22 / 255)
private let tintaAlta = Color(red: 0x1C / 255, green: 0x15 / 255, blue: 0x3E / 255)

struct AguaWidgetView: View {
    var entry: EntradaDeAgua
    @Environment(\.widgetFamily) private var familia

    private var fracao: Double {
        guard let a = entry.agua, a.metaMl > 0 else { return 0 }
        return min(1, Double(a.ml) / Double(a.metaMl))
    }

    private func litros(_ ml: Int) -> String {
        String(format: "%.1f", Double(ml) / 1000).replacingOccurrences(of: ".", with: ",")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("ÁGUA DE HOJE")
                .font(.system(size: 9, weight: .bold))
                .tracking(1.6)
                .foregroundStyle(acento)

            if let agua = entry.agua {
                conteudo(agua)
            } else {
                vazio
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(for: .widget) { fundo }
        .widgetURL(URL(string: "assumfit://habitos"))
    }

    private var fundo: some View {
        ZStack {
            LinearGradient(colors: [tintaAlta, tinta], startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(colors: [acento.opacity(0.30), .clear], center: .topTrailing, startRadius: 0,
                           endRadius: familia == .systemMedium ? 220 : 150)
        }
    }

    private func conteudo(_ agua: AguaDeHoje) -> some View {
        HStack(alignment: .center, spacing: 12) {
            // O anel: a mesma peça da tela de Água, reduzida.
            ZStack {
                Circle().stroke(Color.white.opacity(0.12), lineWidth: 6)
                Circle()
                    .trim(from: 0, to: fracao)
                    .stroke(acento, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 0) {
                    Text(litros(agua.ml))
                        .font(.system(size: 16, weight: .light))
                        .foregroundStyle(.white)
                    Text("de \(litros(agua.metaMl)) L")
                        .font(.system(size: 8))
                        .foregroundStyle(.white.opacity(0.56))
                }
            }
            .frame(width: 64, height: 64)

            VStack(alignment: .leading, spacing: 6) {
                Spacer(minLength: 0)
                if #available(iOS 17.0, *) {
                    Button(intent: RegistrarAguaIntent()) {
                        HStack(spacing: 4) {
                            Image(systemName: "plus")
                                .font(.system(size: 10, weight: .bold))
                            Text("\(agua.copoMl) ml")
                                .font(.system(size: 11, weight: .semibold))
                        }
                        .foregroundStyle(tinta)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(Capsule().fill(acento))
                    }
                    .buttonStyle(.plain)
                } else {
                    // Antes do iOS 17 não há botão em widget: o toque abre o app.
                    Text("Toque para registrar")
                        .font(.system(size: 10))
                        .foregroundStyle(.white.opacity(0.56))
                }
            }
        }
    }

    private var vazio: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Abra o AssumFit")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
            Text("para o widget conhecer sua meta")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.56))
            Spacer(minLength: 0)
        }
    }
}

struct AguaWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ProvedorDeAgua()) { entry in
            AguaWidgetView(entry: entry)
        }
        .configurationDisplayName("Água de hoje")
        .description("Quanto você já bebeu, e um botão para registrar um copo sem abrir o app.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
