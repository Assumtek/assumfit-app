import {
  avaliarInicioDeExercicio,
  BPM_EXERCICIO,
  COOLDOWN_EXERCICIO_MS,
  ESTADO_INICIAL,
  EXERCICIO_SUSTENTADO_MS,
  type EstadoDeExercicio,
} from '../exerciseOnset';

const MIN = 60_000;

const leitura = (agora: number, extra: Partial<Parameters<typeof avaliarInicioDeExercicio>[1]> = {}) => ({
  heartRate: 125,
  emMovimento: true,
  emAtividadeRegistrada: false,
  agora, ...extra,
});

/** Roda leituras a cada 30 s por `minutos` e devolve o estado e se perguntou em algum momento. */
function correr(estado: EstadoDeExercicio, inicio: number, minutos: number, extra = {}) {
  let perguntou = false;
  for (let t = inicio; t <= inicio + minutos * MIN; t += 30_000) {
    const r = avaliarInicioDeExercicio(estado, leitura(t, extra));
    estado = r.estado;
    if (r.perguntar) perguntou = true;
  }
  return { estado, perguntou };
}

describe('avaliarInicioDeExercicio', () => {
  it('batimento alto com movimento por três minutos pergunta, uma vez', () => {
    let perguntas = 0;
    let estado = ESTADO_INICIAL;
    for (let t = 0; t <= 10 * MIN; t += 30_000) {
      const r = avaliarInicioDeExercicio(estado, leitura(t));
      estado = r.estado;
      if (r.perguntar) perguntas += 1;
    }
    expect(perguntas).toBe(1);
  });

  it('não pergunta antes de sustentar: escada não é treino', () => {
    const { perguntou } = correr(ESTADO_INICIAL, 0, 2);
    expect(perguntou).toBe(false);
  });

  it('batimento alto PARADO não é exercício, é assunto de outra vigia', () => {
    const { perguntou } = correr(ESTADO_INICIAL, 0, 10, { emMovimento: false });
    expect(perguntou).toBe(false);
  });

  it('com treino ou sessão em curso, não há o que perguntar', () => {
    const { perguntou } = correr(ESTADO_INICIAL, 0, 10, { emAtividadeRegistrada: true });
    expect(perguntou).toBe(false);
  });

  it('abaixo do limiar, mesmo andando, é caminhada, não pergunta', () => {
    const { perguntou } = correr(ESTADO_INICIAL, 0, 10, { heartRate: BPM_EXERCICIO - 1 });
    expect(perguntou).toBe(false);
  });

  it('interrupção zera o relógio do esforço', () => {
    let estado = ESTADO_INICIAL;
    // Dois minutos de esforço, um minuto parado, dois minutos de esforço: nunca
    // somou três seguidos.
    ({ estado } = correr(estado, 0, 2));
    estado = avaliarInicioDeExercicio(estado, leitura(2.5 * MIN, { emMovimento: false })).estado;
    const r = correr(estado, 3 * MIN, 2);
    expect(r.perguntou).toBe(false);
  });

  it('depois de perguntar, respeita o cooldown mesmo com esforço contínuo', () => {
    let estado = ESTADO_INICIAL;
    const primeira = correr(estado, 0, 5);
    expect(primeira.perguntou).toBe(true);
    // Uma hora seguindo em esforço: nada.
    const meio = correr(primeira.estado, 5 * MIN, 60);
    expect(meio.perguntou).toBe(false);
    // Passado o cooldown, e sustentando de novo, pergunta outra vez.
    const depois = correr(meio.estado, COOLDOWN_EXERCICIO_MS + 10 * MIN, 5);
    expect(depois.perguntou).toBe(true);
  });

  it('o limiar de tempo é o exportado', () => {
    let estado = ESTADO_INICIAL;
    estado = avaliarInicioDeExercicio(estado, leitura(0)).estado;
    const antes = avaliarInicioDeExercicio(estado, leitura(EXERCICIO_SUSTENTADO_MS - 1));
    expect(antes.perguntar).toBe(false);
    const no = avaliarInicioDeExercicio(antes.estado, leitura(EXERCICIO_SUSTENTADO_MS));
    expect(no.perguntar).toBe(true);
  });
});
