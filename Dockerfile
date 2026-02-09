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

# Enable verbose cache logging (set to "false" to disable)
ENV VERBOSE_CACHE=true

# Expose port
EXPOSE 3000

# Run migrations, seed if empty, and start server
CMD ["sh", "-c", "bun run src/db/startup.ts && bun run src/server.ts"]
