# syntax=docker/dockerfile:1
FROM node:24.20.0-bookworm-slim AS build
WORKDIR /build
RUN npm install --global pnpm@10.34.5

# Cache dependency installation independently of game source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc ./
COPY apps/server/package.json apps/server/package.json
COPY apps/client/package.json apps/client/package.json
COPY packages/game-core/package.json packages/game-core/package.json
COPY packages/protocol/package.json packages/protocol/package.json
RUN --mount=type=cache,id=krunker-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

COPY tsconfig.base.json ./
COPY packages/ packages/
COPY apps/ apps/
ENV VITE_SERVER_URL=same-origin
RUN pnpm build
RUN --mount=type=cache,id=krunker-pnpm,target=/pnpm/store \
    pnpm --filter @fps/server deploy --legacy --prod /runtime --store-dir=/pnpm/store

FROM node:24.20.0-bookworm-slim AS server
ENV NODE_ENV=production HOST=0.0.0.0 PORT=2567
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ ./
USER node
EXPOSE 2567
CMD ["node", "dist/index.js"]

FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /build/apps/client/dist/ /srv/
