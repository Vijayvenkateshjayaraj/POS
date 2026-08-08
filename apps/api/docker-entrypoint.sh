#!/bin/sh
set -eu

mkdir -p "${UPLOADS_DIR:-/app/uploads}"
npm run db:migrate --workspace @unified-commerce/api
npm run db:seed --workspace @unified-commerce/api
exec npm run start:prod --workspace @unified-commerce/api

