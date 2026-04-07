# ─── Base ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ─── Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# ─── Development ──────────────────────────────────────────────────────
FROM node:20-alpine AS development
WORKDIR /app
RUN apk add --no-cache curl
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
EXPOSE 3001
CMD ["npm", "run", "start:dev"]

# ─── Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache curl dumb-init

# Само production deps
COPY --from=base /app/node_modules ./node_modules
# Build output
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY package*.json ./
COPY prisma ./prisma

# Non-root user за сигурност
RUN addgroup -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nestjs && \
    chown -R nestjs:nodejs /app
USER nestjs

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
