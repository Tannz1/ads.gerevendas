#!/bin/sh
# Aplica /migrations/*.sql em ordem, uma vez cada, registrando em
# supabase_migrations.schema_migrations (mesma tabela da Supabase CLI). Idempotente.
set -eu

# A migration de imagens cria o bucket em storage.buckets; auth.users é referenciada por FKs.
until psql -tAc "select to_regclass('auth.users') is not null and to_regclass('storage.buckets') is not null" 2>/dev/null | grep -q t; do
  echo "aguardando auth e storage..."
  sleep 3
done

psql -v ON_ERROR_STOP=1 -q <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
SQL

for f in /migrations/*.sql; do
  base=$(basename "$f" .sql)
  version=${base%%_*}
  name=${base#*_}
  if [ -n "$(psql -tAc "select 1 from supabase_migrations.schema_migrations where version = '$version'")" ]; then
    continue
  fi
  echo "migration: $base"
  psql -v ON_ERROR_STOP=1 -q -1 -f "$f" \
    -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name')"
done

psql -qc "notify pgrst, 'reload schema'"
echo "migrations ok"
