/**
 * Widget do treino de hoje.
 *
 * O target vive AQUI, e não em `ios/`, porque `ios/` é gerado por `expo
 * prebuild` e descartado a cada rodada — um target criado à mão lá dentro
 * desapareceria no próximo prebuild sem deixar rastro. Este arquivo é a fonte
 * da verdade, e o plugin recria o target do zero toda vez.
 *
 * O App Group é como o widget lê o dado: ele roda em outro processo, com outro
 * sandbox, e não enxerga nada do app. O identificador precisa bater exatamente
 * com o que o app usa ao escrever.
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'Treino',
  icon: '../../assets/icon.png',
  entitlements: {
    'com.apple.security.application-groups': [`group.${config.ios.bundleIdentifier}.widget`],
  },
});
