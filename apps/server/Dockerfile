FROM node:24-bookworm-slim AS build

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json

RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/server apps/server

RUN pnpm --filter @tab-orga/server build
RUN pnpm --filter @tab-orga/server smoke:prod
RUN pnpm --filter @tab-orga/server --prod deploy --legacy /prod/server

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV TAB_ORGA_HOST=0.0.0.0
ENV TAB_ORGA_DATA_DIR=/data

WORKDIR /app/apps/server

COPY --from=build /prod/server ./

RUN mkdir -p /data

EXPOSE 7777

CMD ["node", "dist/index.js"]
