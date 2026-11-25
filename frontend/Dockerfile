# Builds the React app and serves it with Caddy (HTTPS via Let's Encrypt).
# Built by docker-compose.prod.yml (service "caddy").
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
