FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY prisma.config.ts ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/prisma-migrate-deploy.mjs && node dist/server.js"]
