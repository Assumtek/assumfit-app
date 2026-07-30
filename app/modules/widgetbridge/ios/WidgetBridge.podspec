# Ponte entre o app e o widget.
#
# Módulo minúsculo de propósito: a única coisa que ele faz é escrever no
# UserDefaults do App Group e pedir ao WidgetKit que recarregue. Poderia ter
# entrado no módulo do wearable, que já existe e já compila — mas ali dentro
# ficaria escondido atrás de um nome que fala de Bluetooth, e ninguém
# procuraria uma função de widget lá.
Pod::Spec.new do |s|
  s.name           = 'WidgetBridge'
  s.version        = '1.0.0'
  s.summary        = 'Escreve o treino de hoje no App Group lido pelo widget.'
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

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
