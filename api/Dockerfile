FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
COPY mcp/package.json mcp/
COPY packages/canvas-contract/package.json packages/canvas-contract/
RUN npm ci
COPY tsconfig.base.json eslint.config.js ./
COPY api api
COPY packages packages

ENV NODE_ENV=production
ENV CANVAS_API_PORT=8787
EXPOSE 8787
CMD ["npx", "tsx", "api/src/local.ts"]
