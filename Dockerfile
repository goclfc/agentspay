FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install --ignore-scripts
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN cd packages/shared && npx tsc
RUN cd apps/api && npx tsc && npx tsc-alias

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV STRIPE_SECRET_KEY=sk_test_51RGyR9JtzEEUkyC6pDZORcmh9fmA4K1G6WUymyG8BFSiBhJNNRoy0NGvaYY1XsiV1qWBg9Mq4ecR2Ysfc8oJRdw800soY0ZLCz
ENV STRIPE_WEBHOOK_SECRET=whsec_50996801abc6a8db8a210e5633f93210463733b4eca7a78ff4aa7697ee8a5836
ENV API_URL=https://agentspay.usectl.com
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/public ./apps/api/public
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/.env.production ./apps/api/.env.production
EXPOSE 80
CMD ["sh", "-c", "cd apps/api && export $(cat .env.production | xargs) && for i in 1 2 3 4 5; do npx prisma db push --skip-generate && break || sleep 5; done && node dist/index.js"]
