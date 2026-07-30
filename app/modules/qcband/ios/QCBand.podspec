# Empacota o SDK do fabricante como módulo local do Expo.
#
# O framework é ESTÁTICO e arm64 puro — não tem fatia de simulador. Isso não é
# limitação nossa: o fornecedor compila só para aparelho, e faz sentido, já que
# o simulador não tem Bluetooth de qualquer forma.
#
# A tentação é excluir o alvo de simulador com EXCLUDED_ARCHS. NÃO FAÇA ISSO —
# foi o que estava aqui antes, e via `user_target_xcconfig` a exclusão vazava
# para o alvo do APP, deixando o projeto inteiro sem destino de simulador. O
# app parava de rodar no simulador por causa de um módulo de Bluetooth, e o
# sintoma ("Unable to find a destination matching the provided destination
# specifier") não aponta para cá de forma nenhuma.
#
# O certo é o módulo compilar nos dois e o FRAMEWORK só entrar no aparelho:
# as flags abaixo têm escopo [sdk=iphoneos*], e o Swift se anula no simulador
# com `#if !targetEnvironment(simulator)`.
Pod::Spec.new do |s|
  s.name           = 'QCBand'
  s.version        = '1.0.0'
  s.summary        = 'Ponte para o QCBandSDK (QRing) do fabricante da pulseira.'
  s.description    = 'Expõe conexão, medição em tempo real e histórico do wearable ao React Native.'
  s.author         = 'Assumtek'
  s.homepage       = 'https://assumfit.com.br'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # `preserve_paths` em vez de `vendored_frameworks`: este último vale para
  # todos os SDKs e arrastaria o framework arm64 para o link do simulador.
  s.preserve_paths = 'QCBandSDK.framework'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    # Sem `$(inherited)` estas chaves SUBSTITUEM os caminhos que o CocoaPods
    # gera, e o próprio ExpoModulesCore some do escopo do compilador.
    'FRAMEWORK_SEARCH_PATHS[sdk=iphoneos*]' => '$(inherited) "$(PODS_TARGET_SRCROOT)"',
    'OTHER_LDFLAGS[sdk=iphoneos*]' => '$(inherited) -framework "QCBandSDK"',
  }
  # O app precisa das mesmas flags: framework estático se resolve no link final.
  s.user_target_xcconfig = {
    'FRAMEWORK_SEARCH_PATHS[sdk=iphoneos*]' => '$(inherited) "${PODS_ROOT}/../../modules/qcband/ios"',
    'OTHER_LDFLAGS[sdk=iphoneos*]' => '$(inherited) -framework "QCBandSDK"',
  }

  s.source_files = "**/*.{h,m,swift}"
  s.exclude_files = "QCBandSDK.framework/**/*"
end
