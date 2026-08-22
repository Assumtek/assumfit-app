# O despertador do planejador de sono, criado pelo próprio app.
#
# Até o iOS 18 não havia API: o máximo era abrir o Relógio e dizer a hora em
# voz alta. O iOS 26 trouxe o AlarmKit, que deixa um app marcar um alarme de
# verdade — com permissão da pessoa e com a tela de alarme do sistema. Este
# módulo é só isso; abaixo do iOS 26 ele responde "unsupported" e o JS volta
# ao caminho antigo.
Pod::Spec.new do |s|
  s.name           = 'AlarmKitBridge'
  s.version        = '1.0.0'
  s.summary        = 'Cria o despertador do planejador de sono pelo AlarmKit (iOS 26+).'
  s.author         = 'Assumtek'
  s.homepage       = 'https://assumfit.com.br'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
  }

  # AlarmKit é framework de sistema; `weak` porque só existe a partir do iOS 26
  # e o binário precisa carregar em versões anteriores.
  s.weak_frameworks = 'AlarmKit'

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
