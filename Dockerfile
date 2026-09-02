# syntax=docker/dockerfile:1

# --- Stage 1: build the React (Vite) frontend ---
#
# `--platform=$BUILDPLATFORM` épingle cette étape à l'architecture de la machine qui construit,
# au lieu de celle visée. Sans cela, une image arm64 construite depuis un runner amd64 exécute
# `npm ci` sous QEMU, où Node finit par recevoir une instruction illégale (SIGILL) et emporte
# la construction avec lui.
#
# Rien n'est perdu : le résultat de cette étape est du JavaScript, du CSS et un binaire
# WebAssembly, identiques quelle que soit l'architecture. Seule l'étape d'exécution, qui ne fait
# que copier des fichiers, reste construite pour chaque plateforme visée.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Stage 2: production runtime ---
# server/ n'a aucune dépendance npm : seul package.json (pour "type": "module")
# et le résultat du build sont nécessaires, pas de node_modules.
FROM node:22-alpine AS runtime

LABEL org.opencontainers.image.title="Gestock" \
      org.opencontainers.image.description="Inventaire du congélateur et des placards : sections, quantités, péremptions" \
      org.opencontainers.image.source="https://github.com/fuzzinvaders/gestock" \
      org.opencontainers.image.url="https://github.com/fuzzinvaders/gestock"

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

COPY package.json ./
COPY server ./server
# Les outils voyagent avec l'image : redonner un mot de passe oublié doit être possible depuis
# le conteneur, sans dépôt cloné ni Node sur l'hôte.
COPY tools ./tools
COPY --from=build /app/dist ./dist

RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["node", "server/server.js"]
