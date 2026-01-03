# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source files
COPY . .

# Build frontend
RUN npm run build

# Build server
RUN npm run build:server

# Production stage
FROM node:20-alpine AS production

# Install basic tools
RUN apk add --no-cache ca-certificates

WORKDIR /app

# Create data directory for persistence
RUN mkdir -p /app/data && chmod 777 /app/data

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# Copy start script
COPY start.sh ./
RUN chmod +x start.sh

# Copy GOST binary from official image (v3)
COPY --from=gogost/gost:latest /bin/gost /usr/local/bin/gost

# Expose ports: 31130 (UI), 31131 (Proxy), 31132 (API)
EXPOSE 31130 31131 31132

# Set environment variables
ENV NODE_ENV=production
ENV PORT=31130
# Can be overridden
ENV GOST_API_URL=http://localhost:31132
ENV GOST_PROXY_URL=http://localhost:31131

# Start the server wrapper
CMD ["./start.sh"]
