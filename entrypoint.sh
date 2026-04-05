#!/bin/sh
set -e

# Generate maskable icon PNGs from SVG (if not already present)
if [ ! -f /app/frontend/img/icon-maskable-192.png ]; then
  echo "Generating maskable icon PNGs..."
  node -e "
    const sharp = require('sharp');
    const fs = require('fs');
    const svg = fs.readFileSync('/app/frontend/img/icon-maskable.svg');
    Promise.all([
      sharp(svg).resize(192,192).png().toFile('/app/frontend/img/icon-maskable-192.png'),
      sharp(svg).resize(512,512).png().toFile('/app/frontend/img/icon-maskable-512.png')
    ]).then(() => console.log('Maskable icons generated')).catch(e => console.error(e.message));
  " 2>&1
fi

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
