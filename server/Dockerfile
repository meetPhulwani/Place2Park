# Build from the repository root:
#   docker build -f server/Dockerfile --target production -t place2park-api:local .

FROM node:22-alpine AS server-deps
WORKDIR /app
COPY package.json ./
COPY server/package.json server/package-lock.json ./server/
WORKDIR /app/server
RUN npm ci
COPY server/ ./

FROM server-deps AS build
RUN npm run build

FROM node:22-alpine AS console-build
WORKDIR /app
COPY package.json ./
COPY client/package.json client/package-lock.json ./client/
WORKDIR /app/client
RUN npm ci
COPY client/ ./
ENV CONSOLE_BUILD=1
RUN npm run build

# Debian, not Alpine: the in-memory development database has no Alpine build.
# Production stays on Alpine and uses the external MongoDB URI.
FROM node:22-bookworm-slim AS development
WORKDIR /app
COPY package.json ./
COPY server/package.json server/package-lock.json ./server/
WORKDIR /app/server
RUN npm ci \
  && apt-get update \
  && apt-get install -y --no-install-recommends gosu ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /opt/place2park \
  && cp -a /app/server/node_modules /opt/place2park/server-node_modules \
  && cp /app/server/package-lock.json /opt/place2park/server-package-lock.json
# The in-memory development database binary needs libcurl.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libcurl4 \
  && rm -rf /var/lib/apt/lists/*
COPY server/ ./
COPY server/docker-dev-entrypoint.sh /entrypoint-dev.sh
WORKDIR /app/server
ENV NODE_ENV=development
EXPOSE 5000
ENTRYPOINT ["sh", "/entrypoint-dev.sh"]

FROM node:22-alpine AS production
WORKDIR /app
RUN apk add --no-cache tini su-exec \
  && mkdir -p /app/server/uploads
COPY package.json /app/package.json
COPY server/package.json server/package-lock.json /app/server/
COPY server/docker-entrypoint.sh /entrypoint.sh
RUN cd /app/server && npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/server/dist /app/server/dist
COPY --from=build --chown=node:node /app/server/public /app/server/public
COPY --from=console-build --chown=node:node /app/client/dist-console /app/client/dist-console
ENV NODE_ENV=production
WORKDIR /app/server
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["sh", "/entrypoint.sh"]
