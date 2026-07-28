## Build stage
FROM node:18-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
# Fail the image build if tsc fails. Do not use `|| true` — that shipped stale dist to prod.
RUN npm run build
RUN mkdir -p dist/database/migrations && \
    cp -f src/database/migrations/*.sql dist/database/migrations/

## Runtime stage
FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/bin/init.js"]


