#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  npx prisma migrate deploy
fi

exec "$@"
