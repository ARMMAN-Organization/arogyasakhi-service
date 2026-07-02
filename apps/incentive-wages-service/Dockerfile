FROM node:20.11-alpine AS builder
WORKDIR /workspace
COPY . .
RUN npm ci
RUN npx prisma generate --schema apps/incentive-wages-service/prisma/schema.prisma
RUN npx nx build incentive-wages-service

FROM node:20.11-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /workspace/dist/apps/incentive-wages-service ./
RUN npm ci --omit=dev
USER node
EXPOSE 3008
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3008/api/v1/health/live || exit 1
CMD ["node", "main.js"]
