# Runs the MCP server over stdio, for hosts and directories that build the
# repository rather than install the npm package. `npx -y @cedulon/mcp-server`
# is the shorter path for everyone else.
#
#   docker build -t cedulon .
#   docker run -i --rm cedulon
#
# Nothing here reaches a network rail: the server settles on a mock rail and
# holds no wallet, so the image needs no credentials.

FROM node:22-slim AS build
WORKDIR /app

# tsconfig.build.base.json carries rewriteRelativeImportExtensions; without it
# every package fails on its own `.ts` import specifiers.
COPY package.json package-lock.json tsconfig.build.base.json ./
COPY packages ./packages

# cbor-x's optional native helper is a test-only decoder and its install script
# is not needed to build or run the server.
RUN npm ci --ignore-scripts
RUN npm run build:packages

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages ./packages
COPY --from=build /app/packages ./packages
RUN npm ci --omit=dev --ignore-scripts

# stdio transport: the protocol is the container's stdin/stdout, so run it with
# `docker run -i` and keep anything else off stdout.
CMD ["node", "packages/mcp-server/dist/index.js"]
