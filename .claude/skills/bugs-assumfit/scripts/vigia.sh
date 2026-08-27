#!/bin/bash
# Vigia da fila de feedback: imprime cada relato NOVO, uma vez.
#
# É a rede de segurança do Socket Mode do Slack, e também cobre o TestFlight,
# que não tem socket nenhum. Vive no repositório porque a versão anterior morava
# no diretório temporário da sessão e foi apagada com ele (ago/2026), levando
# junto a lista de "já vistos" e deixando oito relatos passarem em silêncio.
#
#   bash .claude/skills/bugs-assumfit/scripts/vigia.sh [intervalo_em_segundos]
set -uo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
INTERVALO="${1:-300}"
VISTOS="$HOME/.credenciais/assumfit/feedback-vistos.txt"
touch "$VISTOS"

while true; do
  python3 "$AQUI/feedback.py" 2>/dev/null | python3 -c "
import json, sys
try:
    itens = json.load(sys.stdin)
except Exception:
    raise SystemExit
for i in itens:
    print(i['id'], '|', i.get('testador'), '| build', i.get('build'), '|',
          (i['comentario'] or '')[:160].replace(chr(10), ' '))
" 2>/dev/null | while IFS= read -r linha; do
    [ -z "$linha" ] && continue
    id="${linha%% *}"
    if ! grep -qxF "$id" "$VISTOS" 2>/dev/null; then
      echo "$id" >> "$VISTOS"
      echo "NOVO $linha"
    fi
  done
  sleep "$INTERVALO"
done
