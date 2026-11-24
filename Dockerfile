# syntax=docker/dockerfile:1

# ---- Dependencias de producción ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Imagen final ----
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY migrations ./migrations
COPY scripts ./scripts
COPY src ./src

# No correr como root dentro del contenedor.
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# Dockerfile (la semilla solo corre si SEED_STAGING=true)
CMD ["sh", "-c", "node scripts/migrate.js && { [ \"$SEED_STAGING\" != \"true\" ] || node scripts/seed-staging.js; } && exec node src/main.js"]

