import { comSeriesDoServidor } from '../workout.store';

/**
 * O progresso da sessão vivia só na memória do app. Fechar o app no meio do
 * treino (ou o iOS matá-lo por memória) apagava tudo, e voltar mostrava a
 * sessão reconhecida com a ficha em branco, enquanto o servidor tinha cada
 * série registrada (Bruno, 19/09/2026).
 */
const serie = (n: number, load: number | null, reps: number | null, completed = true) => ({
  workoutExerciseId: 'ex-1',
  setOrder: n,
  load,
  repetitions: reps,
  completed,
});

describe('remontar a ficha com o que o servidor guardou', () => {
  it('preenche a ficha vazia com as séries registradas', () => {
    const r = comSeriesDoServidor({}, [serie(1, 40, 12), serie(2, 45, 10)]);
    expect(r['ex-1']).toEqual([
      { load: '40', reps: '12', completed: true },
      { load: '45', reps: '10', completed: true },
    ]);
  });

  it('o que está na MEMÓRIA vence: pode não ter sido enviado ainda', () => {
    // A pessoa digitou 50 kg e a rede caiu antes do envio; o servidor ainda
    // tem 40. Sobrescrever apagaria o que ela acabou de registrar.
    const memoria = { 'ex-1': [{ load: '50', reps: '8', completed: false }] };
    const r = comSeriesDoServidor(memoria, [serie(1, 40, 12)]);
    expect(r['ex-1'][0]).toEqual({ load: '50', reps: '8', completed: false });
  });

  it('série vazia na memória é preenchida pelo servidor', () => {
    const memoria = { 'ex-1': [{ load: '', reps: '', completed: false }] };
    const r = comSeriesDoServidor(memoria, [serie(1, 40, 12)]);
    expect(r['ex-1'][0]).toEqual({ load: '40', reps: '12', completed: true });
  });

  it('série marcada sem número não inventa valor', () => {
    const r = comSeriesDoServidor({}, [serie(1, null, null)]);
    expect(r['ex-1'][0]).toEqual({ load: '', reps: '', completed: true });
  });

  it('sem nada do servidor, a memória passa intacta', () => {
    const memoria = { 'ex-1': [{ load: '50', reps: '8', completed: true }] };
    expect(comSeriesDoServidor(memoria, undefined)).toBe(memoria);
    expect(comSeriesDoServidor(memoria, [])).toBe(memoria);
  });
});
