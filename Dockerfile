# Alles wat bouwt draait op de snelle bouwserver zelf ($BUILDPLATFORM); de afhankelijkheden zijn
# gewone JavaScript, dus er hoeft niets op de doelprocessor (Pi) nagebootst te worden.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY web ./web
RUN npx vite build web && npm prune --omit=dev

FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/yzyr7tqr5t-rgb/hygge-bridge"
WORKDIR /app
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY src ./src
COPY certs ./certs
COPY --from=build /app/web/dist ./web/dist
COPY docker-entrypoint.sh /docker-entrypoint.sh
ENV NODE_ENV=production PORT=3000 STATE_FILE=/data/state.json
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/state >/dev/null || exit 1
CMD ["/docker-entrypoint.sh"]
