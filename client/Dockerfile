# Build from the repository root:
#   docker build -f client/Dockerfile --target production -t place2park-web:local .

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
COPY client/package.json client/package-lock.json ./client/
WORKDIR /app/client
RUN npm ci
COPY client/ ./

FROM deps AS build
ARG VITE_API_URL=/api
ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_RAZORPAY_KEY_ID
ARG VITE_GA_MEASUREMENT_ID
ARG VITE_API_TIMEOUT_MS
ENV VITE_API_URL=$VITE_API_URL \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_RAZORPAY_KEY_ID=$VITE_RAZORPAY_KEY_ID \
    VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID \
    VITE_API_TIMEOUT_MS=$VITE_API_TIMEOUT_MS
RUN npm run build

FROM deps AS development
RUN apk add --no-cache su-exec \
  && mkdir -p /opt/place2park \
  && cp -a /app/client/node_modules /opt/place2park/client-node_modules \
  && cp /app/client/package-lock.json /opt/place2park/client-package-lock.json
COPY client/docker-dev-entrypoint.sh /entrypoint-dev.sh
WORKDIR /app/client
ENV NODE_ENV=development
EXPOSE 5173
ENTRYPOINT ["sh", "/entrypoint-dev.sh"]

FROM nginxinc/nginx-unprivileged:1.27-alpine AS production
COPY client/nginx/nginx.conf /etc/nginx/nginx.conf
COPY client/nginx/place2park.template /etc/nginx/place2park.template
COPY client/docker-entrypoint.sh /entrypoint.sh
COPY --from=build --chown=nginx:nginx /app/client/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz
ENTRYPOINT ["sh", "/entrypoint.sh"]
