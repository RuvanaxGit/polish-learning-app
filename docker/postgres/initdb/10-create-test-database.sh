#!/bin/sh
# Creates the database used by integration and E2E tests, next to the dev database.
# The official postgres image runs this once, when the data volume is first initialized.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v testdb="${POSTGRES_DB}_test" <<'EOSQL'
CREATE DATABASE :"testdb";
EOSQL
