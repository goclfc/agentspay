FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install --ignore-scripts
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma
RUN npx turbo build --filter=@usectl/api

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/public ./apps/api/public
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/package.json ./package.json
EXPOSE 80
CMD ["sh", "-c", "cd apps/api && for i in 1 2 3 4 5; do npx prisma db push --skip-generate && break || sleep 5; done && node dist/index.js"]
