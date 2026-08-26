#!/bin/bash
# Baixa os perfis de provisionamento da App Store Connect para um lugar que
# SOBREVIVE: `~/.credenciais/assumfit/perfis/`.
#
# Eles já viveram no diretório temporário da sessão e sumiram duas vezes no meio
# de uma geração de build (ago/2026). Perfil não é segredo, mas é insumo, e
# insumo de build não pode morar em /tmp.
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
DESTINO="$HOME/.credenciais/assumfit/perfis"
mkdir -p "$DESTINO"

T=$(bash "$AQUI/asc-token.sh")
curl -s -H "Authorization: Bearer $T" \
  "https://api.appstoreconnect.apple.com/v1/profiles?limit=200&filter%5BprofileState%5D=ACTIVE" \
  | python3 -c "
import base64, json, os, sys
destino = sys.argv[1]
d = json.load(sys.stdin)
if 'errors' in d:
    print('erro:', d['errors'][0].get('detail', '')[:120]); raise SystemExit(1)
achados = 0
for p in d.get('data', []):
    a = p['attributes']
    nome = a['name']
    # Só os de LOJA deste app: perfil de desenvolvimento não assina envio.
    if a['profileType'] != 'IOS_APP_STORE':
        continue
    if 'assumfit' not in nome.lower() and 'assumtek' not in nome.lower():
        continue
    bundle = a.get('uuid', nome)
    caminho = os.path.join(destino, f\"{nome.replace(' ', '_')}.mobileprovision\")
    with open(caminho, 'wb') as f:
        f.write(base64.b64decode(a['profileContent']))
    print('perfil:', caminho)
    achados += 1
print('total:', achados)
" "$DESTINO"
