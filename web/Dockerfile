FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
COPY mcp/package.json mcp/
COPY packages/canvas-contract/package.json packages/canvas-contract/
RUN npm ci
COPY tsconfig.base.json eslint.config.js ./
COPY packages packages
COPY web web
RUN npm run build -w @canvas/web

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
