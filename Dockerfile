FROM docker.io/oven/bun:alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY src/ ./src/
COPY public/ ./public/

# Create data directory for local SQLite
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Run migrations and start server
CMD ["sh", "-c", "bun run src/db/migrate.ts && bun run src/server.ts"]
