import SwiftUI
import WidgetKit

/**
 O treino de hoje na tela de início.

 O widget roda em OUTRO PROCESSO, com sandbox próprio: ele não enxerga nada do
 app e não pode chamar a API. Tudo o que mostra vem do App Group, escrito pelo
 app na última vez que abriu. Por isso a data do dado aparece na tela quando
 envelhece — um widget que mostra o treino de terça numa quinta-feira mente com
 confiança, e não há como a pessoa saber.
 */

private let grupo = "group.br.com.assumtek.assumfit.widget"
private let chave = "treinoDeHoje"

struct TreinoDoDia: Codable {
    let nome: String
    let detalhe: String
    let minutos: Int?
    let descanso: Bool
    /// Epoch em segundos de quando o app escreveu isto.
    let gravadoEm: Double
}

struct Entrada: TimelineEntry {
    let date: Date
    let treino: TreinoDoDia?
}

struct Provedor: TimelineProvider {
    func placeholder(in context: Context) -> Entrada {
        Entrada(date: Date(), treino: TreinoDoDia(
            nome: "Peito e tríceps", detalhe: "6 exercícios", minutos: 42,
            descanso: false, gravadoEm: Date().timeIntervalSince1970
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (Entrada) -> Void) {
        completion(Entrada(date: Date(), treino: ler()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entrada>) -> Void) {
        /*
         Recarrega na VIRADA DO DIA, não a cada hora.

         O conteúdo só muda quando o dia muda — pedir atualização de hora em
         hora gastaria o orçamento que o iOS dá ao widget para nada, e o sistema
         passaria a atendê-lo com menos frequência justamente na virada, que é o
         único momento em que importa.
        */
        let agora = Date()
        let amanha = Calendar.current.startOfDay(for: agora.addingTimeInterval(86400))
        let linha = Timeline(entries: [Entrada(date: agora, treino: ler())], policy: .after(amanha))
        completion(linha)
    }

    private func ler() -> TreinoDoDia? {
        guard let defaults = UserDefaults(suiteName: grupo),
              let json = defaults.string(forKey: chave),
              let dados = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(TreinoDoDia.self, from: dados)
    }
}

/*
 A paleta do manual, fixa em código: o widget roda fora do app e não tem acesso
 ao tema. É a MESMA composição do card de destaque das telas — tinta escura,
 halo radial do acento no canto, pill de duração — para o widget parecer um
 pedaço do app na tela de início, não um anexo.
 */
private let acento = Color(red: 0x87 / 255, green: 0x7B / 255, blue: 0xF0 / 255)
private let tinta = Color(red: 0x0E / 255, green: 0x0A / 255, blue: 0x22 / 255)
private let tintaAlta = Color(red: 0x1C / 255, green: 0x15 / 255, blue: 0x3E / 255)

struct TreinoWidgetView: View {
    var entry: Entrada
    @Environment(\.widgetFamily) private var familia

    /// O dado é de outro dia — o app não abriu desde então.
    private var desatualizado: Bool {
        guard let t = entry.treino else { return false }
        let quando = Date(timeIntervalSince1970: t.gravadoEm)
        return !Calendar.current.isDate(quando, inSameDayAs: Date())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("TREINO DE HOJE")
                .font(.system(size: 9, weight: .bold))
                .tracking(1.6)
                .foregroundStyle(acento)

            if let treino = entry.treino, !desatualizado {
                if treino.descanso {
                    descanso
                } else {
                    conteudo(treino)
                }
            } else {
                // Estado honesto: sem dado fresco, o widget diz o que fazer em
                // vez de repetir o treino de outro dia.
                vazio
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(for: .widget) { fundo }
        // Abre direto na tela de treino, e não na home: o widget já disse qual
        // é o treino, e cair na home obrigaria a navegar de novo.
        .widgetURL(URL(string: "assumfit://treinos"))
    }

    /// Tinta com relevo: degradê sutil + halo do acento no canto superior
    /// direito — o mesmo vocabulário do HeroCard das telas.
    private var fundo: some View {
        ZStack {
            LinearGradient(colors: [tintaAlta, tinta], startPoint: .topLeading, endPoint: .bottomTrailing)
            RadialGradient(
                colors: [acento.opacity(0.30), .clear],
                center: .topTrailing,
                startRadius: 0,
                endRadius: familia == .systemMedium ? 220 : 150
            )
        }
    }

    private func conteudo(_ treino: TreinoDoDia) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(treino.nome)
                .font(.system(size: familia == .systemMedium ? 19 : 16, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.8)

            Text(treino.detalhe)
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.56))
                .lineLimit(1)

            Spacer(minLength: 0)

            HStack(spacing: 6) {
                if let min = treino.minutos {
                    HStack(spacing: 3) {
                        Image(systemName: "clock")
                            .font(.system(size: 8, weight: .semibold))
                        Text("\(min) min")
                            .font(.system(size: 10, weight: .semibold))
                    }
                    .foregroundStyle(acento)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(acento.opacity(0.16)))
                    .overlay(Capsule().stroke(acento.opacity(0.38), lineWidth: 1))
                }

                Spacer(minLength: 0)

                // O convite à ação, no canto onde o polegar espera o play.
                Image(systemName: "play.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(tinta)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(acento))
            }
        }
    }

    private var descanso: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Descanso")
                .font(.system(size: familia == .systemMedium ? 19 : 16, weight: .bold))
                .foregroundStyle(.white)
            Text("Recuperar também é treinar.")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.56))
            Spacer(minLength: 0)
            Image(systemName: "moon.zzz.fill")
                .font(.system(size: 14))
                .foregroundStyle(acento.opacity(0.8))
        }
    }

    private var vazio: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Abra o AssumFit")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.white)
            Text("para ver o treino de hoje")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.56))
            Spacer(minLength: 0)
        }
    }
}

/*
 O bundle abriga o widget de treino E o Live Activity do esporte — um alvo só,
 dois produtos. O @main mudou de lugar: um target de widget tem UM entry point.
*/
@main
struct AssumFitWidgets: WidgetBundle {
  var body: some Widget {
    TreinoWidget()
    AguaWidget()
    if #available(iOS 16.2, *) {
      SportLiveActivity()
    }
  }
}

struct TreinoWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TreinoWidget", provider: Provedor()) { entry in
            TreinoWidgetView(entry: entry)
        }
        .configurationDisplayName("Treino de hoje")
        .description("O treino do dia, sem abrir o app.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
