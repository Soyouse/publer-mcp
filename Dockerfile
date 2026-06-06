# publer-mcp — image de prod (MCP HTTP Publer, multi-workspace).
# ⚠️ Prod = deps de prod uniquement + AUCUN script (husky/prepare ne tourne pas hors dev).
# ⚠️ Bind interne 0.0.0.0 (la frontière de sécurité = le mapping de port Docker publié sur
#    l'IP Tailscale, voir docker-compose.yml), d'où PUBLER_MCP_CONTAINER=1 attendu à l'exécution.
FROM node:22-slim

WORKDIR /app

# Couche deps cachée tant que les manifests ne changent pas.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Code applicatif (node_modules/.secrets.json exclus via .dockerignore).
COPY . .

ENV NODE_ENV=production

# Transport HTTP (StreamableHTTP). Le serveur refuse de démarrer sans token (voir http.js).
CMD ["node", "http.js"]
