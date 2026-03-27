FROM node:22-alpine

# Install nginx
RUN apk add --no-cache nginx

# Backend dependencies
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

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
