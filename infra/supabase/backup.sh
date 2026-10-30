#!/bin/sh
# Dump diário do banco do Ads (formato custom do pg_dump) no volume ads-db-backups.
# Mantém BACKUP_KEEP_DAYS dias (padrão 14), contando também os dumps pré-migration.
# ponytail: a cópia fica na mesma VPS; protege de erro lógico e migration ruim, não de perda do
# disco. Copiar /backups para fora (S3/R2/Drive) quando houver destino.
# Restauração: docs/DEPLOY_EASYPANEL.md, seção "Backup e restauração".
set -eu
keep=${BACKUP_KEEP_DAYS:-14}

until pg_isready -q; do
  echo "aguardando o banco..."
  sleep 5
done

while true; do
  f=/backups/ads-$(date -u +%Y%m%dT%H%M%SZ).dump
  if pg_dump -Fc -f "$f.tmp"; then
    mv "$f.tmp" "$f"
    echo "backup ok: $f ($(du -h "$f" | cut -f1))"
  else
    rm -f "$f.tmp"
    echo "backup FALHOU" >&2
  fi
  find /backups -name '*.dump' -mtime +"$keep" -delete
  sleep 86400
done
