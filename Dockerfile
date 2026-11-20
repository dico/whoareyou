FROM node:22-alpine

# Install nginx, and pull security fixes for the base image's system packages
# (openssl, zlib …) that are newer than the node:22-alpine tag itself.
RUN apk upgrade --no-cache && apk add --no-cache nginx

# Backend dependencies
WORKDIR /app/backend
COPY backend/package*.json ./
# npm is only needed to install; remove it afterwards so its own bundled
# dependencies (pacote, sigstore, glob …) don't ship in the runtime image.
# entrypoint.sh calls knex directly instead of via npx.
RUN npm ci --omit=dev \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /root/.npm

# Copy backend source
COPY backend/knexfile.js ./
COPY backend/src ./src

# Copy frontend (static files, no build step)
COPY frontend /app/frontend

# Nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Uploads directory
RUN mkdir -p /app/uploads

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

CMD ["/entrypoint.sh"]
