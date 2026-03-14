# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3 (if still used in dev/staging)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# Stage 2: Production
FROM node:20-slim

WORKDIR /app

# Non-root user for security
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs
USER nodejs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
