#!/bin/sh
# Backup do Postgres com retenção.
#
# Roda no contêiner `backup` do compose de produção, num laço simples em vez de
# cron: a imagem do Postgres não traz cron, e um contêiner cuja única tarefa é
# dormir e despejar não justifica construir uma imagem própria.
#
# `pg_dump -Fc` gera formato custom, não SQL puro: comprime, permite restaurar
# tabela por tabela e é o que `pg_restore -j` consegue paralelizar. Num banco com
# hypertable de milhões de linhas, essa diferença decide se um incidente dura
# vinte minutos ou quatro horas.
set -eu

INTERVAL_S="${BACKUP_INTERVAL_SECONDS:-86400}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
DIR=/backups

mkdir -p "$DIR"

while true; do
  STAMP=$(date -u +%Y%m%dT%H%M%SZ)
  FILE="$DIR/assumfit-$STAMP.dump"

  echo "[backup] iniciando $STAMP"
  if pg_dump --format=custom --compress=6 --file="$FILE" "$DATABASE_URL"; then
    echo "[backup] gravado: $(du -h "$FILE" | cut -f1)"

    # A verificação é o que separa um backup de um arquivo grande. `pg_restore
    # --list` lê o índice do dump: se ele estiver truncado ou corrompido, a
    # falha aparece agora, e não seis meses depois no meio de um desastre.
    if pg_restore --list "$FILE" > /dev/null 2>&1; then
      echo "[backup] verificado"

      # A poda roda SÓ depois de um backup bom. Invertida, uma sequência de
      # falhas apagaria os backups válidos até não sobrar nenhum — o modo de
      # falha mais cruel que uma rotina de backup pode ter.
      find "$DIR" -name 'assumfit-*.dump' -type f -mtime "+$KEEP_DAYS" -delete
    else
      echo "[backup] ARQUIVO ILEGÍVEL, descartando" >&2
      rm -f "$FILE"
    fi
  else
    echo "[backup] FALHOU" >&2
    rm -f "$FILE"
  fi

  sleep "$INTERVAL_S"
done
