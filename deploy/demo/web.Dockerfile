# The built frontend, served by Caddy, which also passes /api/* to the API.
# Build context: the repo root.
FROM node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci -w frontend --ignore-scripts
COPY frontend frontend
# Same-origin API: the browser calls /api/..., so the build needs no domain.
RUN VITE_API_URL=/api npm run build -w frontend

FROM caddy:2-alpine@sha256:eb4d35b7452d1ab6171fbdbe8d9275b2301dad6dad92115d91e19fb9b24d510f
COPY deploy/demo/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv
