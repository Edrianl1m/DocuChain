# DocuChain API (production). Built by docker-compose.prod.yml.
# Layout mirrors the repository so the relative upload/crypto paths still work:
#   /app/backend   <- this folder
#   /app/uploads   <- stored documents (volume)
#   /app/fabric-network/crypto-config <- Fabric identity (mounted read-only)
FROM node:20-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/backend
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY src ./src
RUN mkdir -p /app/uploads /app/backend/uploads
EXPOSE 3000
CMD ["node", "src/app.js"]
