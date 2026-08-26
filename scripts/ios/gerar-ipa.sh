#!/bin/bash
# Gera o .ipa de LOJA desta máquina, sem gastar cota do EAS.
#
# A receita inteira está em CLAUDE.md (§ Build de LOJA sem a cota do EAS); aqui
# ela vira um comando só. O script mora no REPOSITÓRIO de propósito: ele já
# viveu no diretório temporário da sessão e sumiu no meio de duas gerações
# (ago/2026), levando junto os perfis. Ferramenta de build não mora em /tmp.
#
#   bash scripts/ios/gerar-ipa.sh          # versão e build vêm do app.json
#
# Depois, para enviar:
#   cd app && npx eas-cli submit -p ios --path <ipa>
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
APP="$RAIZ/app"

VERSAO=$(python3 -c "import json;print(json.load(open('$APP/app.json'))['expo']['version'])")
BUILD=$(python3 -c "import json;print(json.load(open('$APP/app.json'))['expo']['ios']['buildNumber'])")
ARCHIVE="/tmp/assumfit-$VERSAO-b$BUILD.xcarchive"
SAIDA="${SAIDA:-$RAIZ/build}"
PERFIS="$HOME/.credenciais/assumfit/perfis"
IDENT="Apple Distribution: ASSUMFIT TECNOLOGIA EM SAUDE LTDA (5695J86AVD)"
echo "== AssumFit $VERSAO ($BUILD)"

# --- 1. Projeto nativo, e a conferência que separa build bom de app que morre
cd "$APP"
npx expo prebuild -p ios --clean
N=$(grep -c ExpoModulesJSI "ios/Pods/Target Support Files/Pods-AssumFit/Pods-AssumFit-frameworks.sh" || true)
if [ "$N" -lt 1 ]; then
  echo "JSI ausente no script de frameworks; repetindo pod install"
  (cd ios && pod install)
  N=$(grep -c ExpoModulesJSI "ios/Pods/Target Support Files/Pods-AssumFit/Pods-AssumFit-frameworks.sh" || true)
  [ "$N" -ge 1 ] || { echo "ABORTA: sem ExpoModulesJSI, o app morreria na abertura"; exit 1; }
fi
echo "JSI embarcado: $N"

# --- 2. Archive. O endereço da API entra AQUI: sem ele o build de produção
#        apontaria para outro lugar sem avisar.
cd ios
EXPO_PUBLIC_API_URL=https://api.assumfit.com.br xcodebuild \
  -workspace AssumFit.xcworkspace -scheme AssumFit -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$HOME/.credenciais/assumfit/AuthKey_HL24V96G29.p8" \
  -authenticationKeyID HL24V96G29 \
  -authenticationKeyIssuerID 8d686404-5d05-47ec-a739-104be658ea8f \
  DEVELOPMENT_TEAM=5695J86AVD archive

# --- 3. Re-assinatura manual, estilo `fastlane sigh resign`.
#        `xcodebuild -exportArchive` não serve: o gerenciador de perfis do Xcode
#        26 apaga perfis desconhecidos no meio do próprio export.
[ -d "$PERFIS" ] || { echo "sem perfis; rode scripts/ios/baixar-perfis.sh"; exit 1; }
rm -rf "$SAIDA/Payload"; mkdir -p "$SAIDA/Payload"
cp -R "$ARCHIVE/Products/Applications/AssumFit.app" "$SAIDA/Payload/"
BUNDLE="$SAIDA/Payload/AssumFit.app"; APPEX="$BUNDLE/PlugIns/Treino.appex"

# A Apple exige versão IGUAL no app e na extensão.
for plist in "$BUNDLE/Info.plist" "$APPEX/Info.plist"; do
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSAO" "$plist"
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD" "$plist"
done

# O perfil mais NOVO de cada bundle id, entre os que estão em disco.
perfil_de() {
  python3 - "$PERFIS" "$1" <<'PY'
import glob, os, plistlib, subprocess, sys
destino, bundle = sys.argv[1], sys.argv[2]
melhor = None
for p in glob.glob(os.path.join(destino, '*.mobileprovision')):
    d = plistlib.loads(subprocess.run(['security','cms','-D','-i',p],capture_output=True).stdout)
    app_id = d['Entitlements'].get('application-identifier','')
    if app_id.split('.',1)[-1] != bundle:
        continue
    if melhor is None or d['CreationDate'] > melhor[1]:
        melhor = (p, d['CreationDate'])
print(melhor[0] if melhor else '')
PY
}
cp "$(perfil_de br.com.assumtek.assumfit)" "$BUNDLE/embedded.mobileprovision"
cp "$(perfil_de br.com.assumtek.assumfit.widget)" "$APPEX/embedded.mobileprovision"

extrai() {
  security cms -D -i "$1" > "$2.perfil.plist"
  /usr/libexec/PlistBuddy -x -c "Print :Entitlements" "$2.perfil.plist" > "$2"
  # O app não usa HealthKit.access: o perfil traz porque o bundle id permite.
  /usr/libexec/PlistBuddy -c "Delete :com.apple.developer.healthkit.access" "$2" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Set :get-task-allow false" "$2" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :get-task-allow bool false" "$2"
}
extrai "$BUNDLE/embedded.mobileprovision" "$SAIDA/ent-app.plist"
extrai "$APPEX/embedded.mobileprovision" "$SAIDA/ent-widget.plist"

# DE DENTRO PARA FORA: assinar o app primeiro invalidaria o que está dentro.
for fw in "$BUNDLE/Frameworks"/*.framework; do codesign --force --timestamp --sign "$IDENT" "$fw"; done
codesign --force --timestamp --sign "$IDENT" --entitlements "$SAIDA/ent-widget.plist" "$APPEX"
codesign --force --timestamp --sign "$IDENT" --entitlements "$SAIDA/ent-app.plist" "$BUNDLE"
codesign --verify --deep --strict "$BUNDLE"

IPA="$SAIDA/AssumFit-$VERSAO-b$BUILD.ipa"
rm -f "$IPA"
(cd "$SAIDA" && zip -qry "$IPA" Payload)

# --- 4. As conferências que já pouparam um envio quebrado.
echo "== conferência"
echo "frameworks: $(ls "$BUNDLE/Frameworks" | wc -l | tr -d ' ') · JSI: $(ls "$BUNDLE/Frameworks" | grep -c ExpoModulesJSI)"
echo "app:   $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$BUNDLE/Info.plist") ($(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$BUNDLE/Info.plist"))"
echo "appex: $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APPEX/Info.plist") ($(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APPEX/Info.plist"))"
echo "api de produção no bundle: $(grep -c api.assumfit.com.br "$BUNDLE/main.jsbundle" || true)"
echo "ipa: $IPA"
