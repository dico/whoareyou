#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/backend
npx knex migrate:latest

echo "Starting Nginx..."
nginx

echo "Starting Node.js API..."
if [ "$NODE_ENV" = "production" ]; then
  node src/index.js
else
  node --watch src/index.js
fi
