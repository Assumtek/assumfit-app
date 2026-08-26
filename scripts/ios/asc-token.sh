#!/bin/bash
# Token da App Store Connect: JWT ES256 assinado com a chave .p8, por openssl.
#
# Sem PyJWT: instalar um pacote para assinar um JWT de três campos é peso
# desnecessário, e o venv desta máquina não o tem. `openssl dgst` assina em DER;
# a Apple exige o par R|S cru de 64 bytes, e é isso que a conversão no fim faz.
set -euo pipefail
KID="${ASC_KEY_ID:-HL24V96G29}"
ISS="${ASC_ISSUER_ID:-8d686404-5d05-47ec-a739-104be658ea8f}"
P8="$HOME/.credenciais/assumfit/AuthKey_$KID.p8"

b64() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
AGORA=$(date +%s)
CAB=$(printf '{"alg":"ES256","kid":"%s","typ":"JWT"}' "$KID" | b64)
COR=$(printf '{"iss":"%s","iat":%s,"exp":%s,"aud":"appstoreconnect-v1"}' "$ISS" "$AGORA" $((AGORA + 900)) | b64)

ASSINATURA=$(printf '%s.%s' "$CAB" "$COR" \
  | openssl dgst -sha256 -sign "$P8" \
  | python3 -c "
import sys
from base64 import urlsafe_b64encode
der = sys.stdin.buffer.read()
# DER: 30 len 02 rlen R 02 slen S. R e S vão para 32 bytes cada, sem o zero de
# sinal que o DER acrescenta quando o primeiro byte passa de 0x7f.
rlen = der[3]
r = der[4:4+rlen].lstrip(b'\x00').rjust(32, b'\x00')
j = 4 + rlen + 2
slen = der[4+rlen+1]
s = der[j:j+slen].lstrip(b'\x00').rjust(32, b'\x00')
print(urlsafe_b64encode(r + s).decode().rstrip('='))
")
printf '%s.%s.%s' "$CAB" "$COR" "$ASSINATURA"
