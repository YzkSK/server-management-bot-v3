FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile

# next build がページのstatic collection時にparseDashboardAuthEnv()を評価するため、
# 実行時の値ではなくビルドを通すためだけのダミー値をここで渡す。
ARG DISCORD_CLIENT_ID=build-placeholder
ARG DISCORD_CLIENT_SECRET=build-placeholder
ARG DISCORD_BOT_TOKEN=build-placeholder
ARG NEXTAUTH_SECRET=build-placeholder
ARG DATABASE_URL=postgres://build:build@localhost:5432/build
ARG REDIS_URL=redis://localhost:6379
ENV DISCORD_CLIENT_ID=$DISCORD_CLIENT_ID \
    DISCORD_CLIENT_SECRET=$DISCORD_CLIENT_SECRET \
    DISCORD_BOT_TOKEN=$DISCORD_BOT_TOKEN \
    NEXTAUTH_SECRET=$NEXTAUTH_SECRET \
    DATABASE_URL=$DATABASE_URL \
    REDIS_URL=$REDIS_URL

RUN bunx turbo run build --filter=@sm-bot/dashboard...

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/apps/dashboard ./apps/dashboard
WORKDIR /app/apps/dashboard
USER node
EXPOSE 3000
CMD ["node", "--experimental-strip-types", "src/server.ts"]
