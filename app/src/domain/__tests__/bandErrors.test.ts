import { avisoDePulseiraAusente, falhaDeMedicao, textoDaFalha } from '../bandErrors';

describe('falhaDeMedicao', () => {
  it('a recusa de medição cobre as DUAS causas medidas em campo', () => {
    /*
     A tradução literal é "não está sendo usada corretamente", e ela engana: o
     firmware devolve esta mesma mensagem com o sensor OCUPADO. Visto com a
     pulseira firme no pulso e medindo no app do fabricante.
    */
    const f = falhaDeMedicao('未正确佩戴手环');
    expect(f?.corpo).toContain('app do fabricante');
    expect(f?.corpo).toContain('contato com a pele');
    // Não basta dizer o que houve: a frase precisa caber numa ação.
    expect(f?.corpo).toContain('tente de novo');
  });

  it('casa por conteúdo, não por igualdade, o SDK varia o prefixo', () => {
    expect(falhaDeMedicao('手环未正确佩戴')?.titulo).toBe(falhaDeMedicao('未正确佩戴手环')?.titulo);
  });

  it('bateria e medição em curso têm saídas diferentes', () => {
    expect(falhaDeMedicao('电量低')?.titulo).toContain('bateria');
    expect(falhaDeMedicao('正在测量中')?.automatico).toBe(true);
  });

  it('mensagem desconhecida devolve null, para o texto genérico assumir', () => {
    expect(falhaDeMedicao('The operation couldn’t be completed.')).toBeNull();
    expect(falhaDeMedicao('')).toBeNull();
    expect(falhaDeMedicao(null)).toBeNull();
    expect(falhaDeMedicao(undefined)).toBeNull();
  });

  it('nunca vaza o texto do firmware para a tela', () => {
    const f = falhaDeMedicao('未正确佩戴手环');
    expect(`${f?.titulo}${f?.corpo}`).not.toMatch(/[一-鿿]/);
  });
});

/**
 * Os códigos que o SDK 1.0.0.20260812 documentou.
 *
 * Antes deles, "mediu e não devolveu valor" era indistinguível de qualquer
 * outra falha — a tela dizia "não deu para medir" e sugeria ajustar a pulseira,
 * que é exatamente o conselho errado quando o problema é falta de calibração.
 */
describe('falhaDeMedicao por código', () => {
  it('sem-calibracao aponta a calibração, e NÃO manda tentar de novo', () => {
    const f = falhaDeMedicao(null, 'sem-calibracao');
    expect(f?.titulo).toContain('calibrada');
    // Precisa nomear ONDE calibrar: o botão existe em `DeviceScreen`, e uma
    // mensagem que só diz "calibre" manda a pessoa procurar.
    expect(f?.corpo).toContain('Dispositivo');
    // Insistir não resolve: a repetição automática só gastaria bateria.
    expect(f?.automatico).toBe(false);
  });

  it('mal-vestida, início e fim recusados têm saídas próprias', () => {
    expect(falhaDeMedicao(null, 'mal-vestida')?.corpo).toContain('osso do pulso');
    expect(falhaDeMedicao(null, 'inicio-recusado')?.corpo).toContain('Aproxime');
    expect(falhaDeMedicao(null, 'fim-recusado')?.automatico).toBe(true);
  });

  it('o CÓDIGO ganha da mensagem quando os dois existem', () => {
    /*
     A mensagem é texto do firmware: muda entre versões e já mudou uma vez. O
     código é contrato. Com os dois presentes e discordando, vale o contrato.
    */
    const f = falhaDeMedicao('未正确佩戴手环', 'sem-calibracao');
    expect(f?.titulo).toContain('calibrada');
  });

  it('código desconhecido não atropela a mensagem que sabemos ler', () => {
    expect(falhaDeMedicao('电量低', 'firmware')?.titulo).toContain('bateria');
    expect(falhaDeMedicao('电量低', 'falha')?.titulo).toContain('bateria');
  });

  it('sem código e sem mensagem conhecida, devolve null como sempre', () => {
    expect(falhaDeMedicao(null, 'falha')).toBeNull();
    expect(textoDaFalha(null, 'sem-calibracao')).toContain('calibrada');
  });
});

describe('textoDaFalha', () => {
  it('junta título e ação numa frase só', () => {
    expect(textoDaFalha('未正确佩戴手环')).toMatch(/^A pulseira não aceitou medir agora\. /);
  });

  it('sem tradução conhecida, não inventa frase', () => {
    expect(textoDaFalha('erro qualquer')).toBeNull();
  });
});

describe('aviso de pulseira ausente', () => {
  it('bluetooth desligado manda ligar o bluetooth, não procurar a pulseira', () => {
    // O relato: o aviso dizia "a pulseira está longe" com o Bluetooth
    // desligado, e a pessoa gasta a ação errada.
    const a = avisoDePulseiraAusente('Bluetooth desligado');
    expect(a.titulo).toMatch(/bluetooth/i);
    expect(a.corpo).toMatch(/ajustes/i);
  });

  it('reconhece o vocabulário do CoreBluetooth', () => {
    expect(avisoDePulseiraAusente('bluetooth unauthorized').titulo).toMatch(/bluetooth/i);
    expect(avisoDePulseiraAusente('Bluetooth is powered off').titulo).toMatch(/bluetooth/i);
  });

  it('sem motivo conhecido, mantém o texto genérico', () => {
    // Afirmar Bluetooth desligado sem saber é o mesmo erro na direção oposta.
    expect(avisoDePulseiraAusente(null).titulo).toBe('A pulseira está longe');
    expect(avisoDePulseiraAusente('conexão perdida').titulo).toBe('A pulseira está longe');
  });
});
