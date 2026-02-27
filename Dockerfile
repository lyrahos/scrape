# ============================================================================
# Hospital Price Transparency — Docker Configuration
# For running the backend services with PostgreSQL
# ============================================================================
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install --production=false
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/database ./database
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
ENV DB_HOST=postgres
ENV DB_PORT=5432
ENV DB_NAME=hospital_transparency
ENV DB_USER=postgres
ENV DB_PASSWORD=postgres

EXPOSE 3001

CMD ["node", "scripts/migrate.js", "--postgres"]
