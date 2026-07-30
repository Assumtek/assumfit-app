import {
  askBattery,
  CMD,
  isValid,
  packet,
  PACKET_SIZE,
  parseFrame,
  REALTIME,
  startRealtime,
} from '../colmiProtocol';

describe('montagem do pacote', () => {
  it('tem sempre 16 bytes, mesmo sem carga', () => {
    expect(packet(CMD.battery)).toHaveLength(PACKET_SIZE);
    expect(startRealtime(REALTIME.heartRate)).toHaveLength(PACKET_SIZE);
  });

  it('põe o comando no primeiro byte', () => {
    expect(askBattery()[0]).toBe(0x03);
    expect(startRealtime(REALTIME.spo2)[0]).toBe(CMD.startRealtime);
    expect(startRealtime(REALTIME.spo2)[1]).toBe(REALTIME.spo2);
  });

  it('fecha com checksum de soma módulo 255', () => {
    const p = packet(0x03);
    // Só o comando é diferente de zero, então a soma é o próprio comando.
    expect(p[PACKET_SIZE - 1]).toBe(3);

    const q = packet(0x69, [1, 0]);
    expect(q[PACKET_SIZE - 1]).toBe((0x69 + 1) % 255);
  });

  it('usa módulo 255, não máscara de 8 bits', () => {
    /**
     * A diferença aparece exatamente quando a soma é múltipla de 255: `& 0xff`
     * daria 255, o módulo dá 0. Um byte errado faz o aparelho DESCARTAR o
     * pacote sem responder nada — falha silenciosa, das piores de diagnosticar.
     */
    const p = packet(0xff, [0]);
    expect(p[PACKET_SIZE - 1]).toBe(0);
    expect(p[PACKET_SIZE - 1]).not.toBe(0xff);
  });

  it('não deixa a carga transbordar o espaço do checksum', () => {
    const p = packet(0x01, new Array(40).fill(0xaa));
    expect(p).toHaveLength(PACKET_SIZE);
    // O último byte tem de ser o checksum, nunca carga.
    let sum = 0;
    for (let i = 0; i < PACKET_SIZE - 1; i++) sum += p[i];
    expect(p[PACKET_SIZE - 1]).toBe(sum % 255);
  });

  it('valida o próprio pacote que monta', () => {
    expect(isValid(packet(CMD.battery))).toBe(true);
    expect(isValid(startRealtime(REALTIME.heartRate))).toBe(true);
  });

  it('rejeita quadro adulterado ou de tamanho errado', () => {
    const p = packet(CMD.battery);
    p[5] = 0x99;
    expect(isValid(p)).toBe(false);
    expect(isValid(new Uint8Array(8))).toBe(false);
  });
});

describe('leitura de quadros', () => {
  const frame = (bytes: number[]) => {
    const out = new Uint8Array(PACKET_SIZE);
    bytes.forEach((b, i) => (out[i] = b));
    return out;
  };

  it('lê bateria e estado de carga', () => {
    expect(parseFrame(frame([CMD.battery, 87, 1]))).toEqual({ kind: 'battery', level: 87, charging: true });
    expect(parseFrame(frame([CMD.battery, 40, 0]))).toEqual({ kind: 'battery', level: 40, charging: false });
  });

  it('lê frequência cardíaca em tempo real', () => {
    expect(parseFrame(frame([CMD.startRealtime, REALTIME.heartRate, 0, 72]))).toEqual({
      kind: 'heartRate',
      bpm: 72,
    });
  });

  it('lê oxigenação em tempo real', () => {
    expect(parseFrame(frame([CMD.realtimeData, REALTIME.spo2, 0, 97]))).toEqual({ kind: 'spo2', percent: 97 });
  });

  it('distingue "ainda medindo" de leitura, e nunca registra zero', () => {
    /**
     * O sensor leva alguns segundos até o primeiro valor válido e responde com
     * código de erro ou valor zero nesse intervalo. Aceitar isso como leitura
     * registraria 0 bpm — pior que não registrar nada, porque entra no cálculo
     * do score de energia.
     *
     * `measuring` em vez de `unknown` porque o estado É conhecido: o aparelho
     * está trabalhando. A distinção permite à tela dizer "medindo" e ao serviço
     * saber que precisa insistir com o keepalive, em vez de tratar como quadro
     * indecifrável.
     */
    const semValor = parseFrame(frame([CMD.startRealtime, REALTIME.heartRate, 0, 0]));
    expect(semValor.kind).toBe('measuring');

    const comErro = parseFrame(frame([CMD.startRealtime, REALTIME.heartRate, 1, 0]));
    expect(comErro).toEqual({ kind: 'measuring', code: 1 });
  });

  it('lê o histórico e descarta as horas sem medição', () => {
    // Quadro real capturado do aparelho: página 0x13 com 0x4c e 0x49.
    const real = frame([0x15, 0x13, 0, 0, 0, 0, 0, 0x4c, 0x49]);
    expect(parseFrame(real)).toEqual({ kind: 'history', page: 0x13, samples: [76, 73] });

    // Página zerada é hora em que a pulseira não estava no pulso — ausência de
    // medição, não batimento zero.
    expect(parseFrame(frame([0x15, 0x0d]))).toEqual({ kind: 'history', page: 0x0d, samples: [] });
  });

  it('não aceita valor fisiologicamente impossível como batimento', () => {
    // Byte de controle no meio da página não pode virar amostra.
    const comLixo = frame([0x15, 0x01, 0, 250, 5, 200, 0]);
    const parsed = parseFrame(comLixo);
    expect(parsed.kind).toBe('history');
    if (parsed.kind === 'history') expect(parsed.samples).toEqual([200]);
  });

  it('preserva o quadro que não sabe ler, em vez de descartar', () => {
    const desconhecido = frame([0x99, 1, 2, 3]);
    const parsed = parseFrame(desconhecido);
    expect(parsed.kind).toBe('unknown');
    // Durante o mapeamento, o que ainda não sabemos ler é a informação mais
    // valiosa — engolir seria repetir o erro que já custou caro neste projeto.
    if (parsed.kind === 'unknown') {
      expect(parsed.command).toBe(0x99);
      expect(parsed.bytes).toBe(desconhecido);
    }
  });

  it('não quebra com quadro truncado', () => {
    expect(parseFrame(new Uint8Array([1, 2])).kind).toBe('unknown');
    expect(parseFrame(new Uint8Array([])).kind).toBe('unknown');
  });
});
