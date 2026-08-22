import { MockBleService } from './mock';
import type { BleService } from './types';

/**
 * Ponto único de troca entre wearable simulado e real.
 *
 * A escolha vem de `EXPO_PUBLIC_BLE`, não de editar este arquivo: por variável
 * dá para alternar entre mock e aparelho real no MESMO build, que é exatamente
 * o que se precisa ao mapear os UUIDs proprietários — editando código, cada ida
 * e volta custaria um build novo.
 *
 *   EXPO_PUBLIC_BLE=real npx expo start --dev-client --port 8090
 *
 * O padrão continua sendo o mock. `StaranbBleService` já lê frequência
 * cardíaca, intervalos RR (de onde sai o RMSSD) e bateria pelos serviços padrão
 * do Bluetooth SIG, mas os UUIDs proprietários do ANB-X1 — SpO₂, temperatura e
 * PPG bruto — ainda estão nulos em `staranb.ts`. Com o real ligado, as telas
 * que dependem deles ficam vazias, e isso é esperado até o mapeamento.
 */
/**
 * `real` usa o SDK do fabricante; `gatt` força a implementação própria.
 *
 * Os dois caminhos coexistem de propósito. O SDK é o certo para a H59 — o
 * fornecedor já implementou o protocolo, e reimplementá-lo produziria resultado
 * pior. Mas `staranb.ts` continua valendo para qualquer aparelho que fale o
 * perfil padrão do Bluetooth SIG, e é a única forma de inspecionar GATT quando
 * algo não bate com o que o SDK diz.
 */
/*
 O PADRÃO É O RELÓGIO. O simulado exige pedido explícito.

 Era o contrário: sem `EXPO_PUBLIC_BLE`, o app caía no mock e transmitia leitura
 inventada com cara de real. Isso custou horas de investigação — a pulseira
 conectada não aparecia, e a causa era um servidor Metro iniciado sem a
 variável.

 Num produto de saúde o risco é maior que o incômodo: a pessoa não tem como
 saber, olhando a tela, se aquele batimento é dela. Inverter torna o dado falso
 impossível de acontecer por descuido — ele passa a exigir `EXPO_PUBLIC_BLE=mock`,
 digitado de propósito.
 */
const mode = process.env.EXPO_PUBLIC_BLE;
const wantsMock = mode === 'mock';
const wantsReal = !wantsMock;

/**
 * `require` sob guarda, e não import estático.
 *
 * `react-native-ble-plx` é módulo nativo: num binário que não o contenha — o
 * simulador, um dev client anterior à dependência — o import estático derruba o
 * arquivo inteiro e leva a árvore junto. E o simulador **não tem Bluetooth de
 * forma alguma**, então este caminho precisa degradar para o mock em vez de
 * quebrar a abertura do app.
 */
function realService(): BleService | null {
  try {
    if (mode !== 'gatt') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { qcBandAvailable } = require('../../../modules/qcband') as typeof import('../../../modules/qcband');
      if (qcBandAvailable) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { QCBandService } = require('./qcband') as typeof import('./qcband');
        console.log('[ble] usando o SDK do fabricante');
        return new QCBandService();
      }
      console.warn('[ble] SDK do fabricante ausente neste build, caindo para GATT próprio');
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { StaranbBleService } = require('./staranb') as typeof import('./staranb');
    return new StaranbBleService();
  } catch (err) {
    console.warn('[ble] serviço real indisponível, seguindo no mock:', err);
    return null;
  }
}

/*
 O mock é o padrão, e o padrão precisa ser BARULHENTO.

 `EXPO_PUBLIC_BLE` é inlinada pelo Metro no momento do bundle, a partir do
 ambiente do PROCESSO do Metro. Um servidor iniciado sem a variável produz um
 bundle onde ela é `undefined` — e aí não importa que o aparelho esteja pareado,
 que o módulo nativo exista ou que o build tenha o SDK: o app fala com o
 simulador. Sem este aviso o sintoma é uma pulseira conectada que "não aparece",
 e o tempo vai todo para o lado errado do problema.
 */
if (__DEV__ && wantsMock) {
  console.warn('[ble] SIMULADO por pedido explícito (EXPO_PUBLIC_BLE=mock), nenhum dado vem da pulseira.');
}

const resolved = wantsReal ? realService() : null;

/*
 A queda para o simulado só acontece onde não há rádio — simulador de iOS,
 emulador de Android, build sem o módulo nativo. E acontece gritando, porque
 dado simulado que passa por real é o pior desfecho possível aqui.
 */
if (__DEV__ && wantsReal && resolved === null) {
  console.warn(
    '[ble] SEM RÁDIO neste ambiente, caindo no simulado.\n' +
      '      O simulador não tem Bluetooth. Para dado de verdade, use aparelho físico.');
}

export const ble: BleService = resolved ?? new MockBleService();

/** Para a tela de dispositivo poder dizer de onde o dado está vindo. */
export const usingRealDevice = resolved !== null;

/**
 * Se dá para inspecionar GATT — que NÃO é o mesmo que estar no aparelho real.
 *
 * Eram sinônimos enquanto existiam dois serviços. Com o SDK do fabricante são
 * três, e ele é real sem expor GATT nenhum: controla o rádio por conta própria.
 * Telas que perguntavam `usingRealDevice` para decidir sobre o diagnóstico
 * mandavam a pessoa para uma tela que só sabia dizer que não podia fazer nada.
 *
 * A pergunta certa é de capacidade, e é esta.
 */
export const supportsGattInspection = typeof ble.inspect === 'function';

export * from './types';
