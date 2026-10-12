FROM node:22-alpine AS build
RUN apk add --no-cache clang g++
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build && npm test && npm run assure

FROM node:22-alpine
RUN apk add --no-cache libstdc++
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/services ./services
COPY --from=build --chown=node:node /app/build/alert_decision ./build/alert_decision
# Run as an unprivileged user (FINDING CLL-011: the image previously ran as root).
USER node
STOPSIGNAL SIGTERM
CMD ["node", "services/decision-worker.mjs"]
