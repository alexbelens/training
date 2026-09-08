# ---- build frontend ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web ./web
COPY shared ./shared
RUN npm run build

# ---- runtime ----
FROM node:24-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown -R node:node /data /app
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/index.js"]
