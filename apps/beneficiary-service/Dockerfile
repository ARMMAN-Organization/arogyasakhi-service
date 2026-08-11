# Multi-stage build for beneficiary-service. Built from the monorepo root context.
FROM node:24.18.0-alpine AS builder
WORKDIR /workspace
COPY . .
RUN npm ci
RUN npx prisma generate --schema apps/beneficiary-service/prisma/schema.prisma
RUN npx nx build beneficiary-service

FROM node:24.18.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /workspace/dist/apps/beneficiary-service ./
RUN npm ci --omit=dev
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3001/api/v1/health/live || exit 1
CMD ["node", "main.js"]
