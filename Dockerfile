# Stap 1: de React-app bouwen
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY web ./web
RUN npx vite build web

# Stap 2: de server met de gebouwde app
FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/yzyr7tqr5t-rgb/hygge-bridge"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY certs ./certs
COPY --from=web /app/web/dist ./web/dist
COPY docker-entrypoint.sh /docker-entrypoint.sh
ENV NODE_ENV=production PORT=3000 STATE_FILE=/data/state.json
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/state >/dev/null || exit 1
CMD ["/docker-entrypoint.sh"]
