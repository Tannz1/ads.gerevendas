#!/usr/bin/env bash
# Sobe um Postgres temporário, aplica o stub de auth + migrations e roda os testes
# de RLS em supabase/rls-tests/*.test.sql. Uso: npm run test:db
# Variável opcional: PG_BIN (diretório com initdb/pg_ctl/psql).
set -euo pipefail
shopt -s nullglob

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(pg_config --bindir 2>/dev/null || ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PG_TEST_PORT:-54329}"

cleanup() {
  "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

PSQL=("$PG_BIN/psql" -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$ROOT/supabase/rls-tests/00_auth_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migration: $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

status=0
for t in "$ROOT"/supabase/rls-tests/*.test.sql; do
  echo "test: $(basename "$t")"
  if ! "${PSQL[@]}" -o /dev/null -f "$t" 2>&1 | sed -E "s/^psql:[^ ]+ NOTICE:  //"; then
    status=1
  fi
done

exit $status
