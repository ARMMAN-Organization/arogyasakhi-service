FROM node:24.18.0-alpine AS builder
WORKDIR /workspace
COPY . .
RUN npm ci
RUN npx prisma generate --schema apps/sync-service/prisma/schema.prisma
RUN npx nx build sync-service

FROM node:24.18.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /workspace/dist/apps/sync-service ./
RUN npm ci --omit=dev
USER node
EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3010/api/v1/health/live || exit 1
CMD ["node", "main.js"]
