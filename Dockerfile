# syntax=docker/dockerfile:1
# Imagem de produção (Next.js standalone). Usada pelo EasyPanel ou qualquer host Docker.
# A porta vem de PORT (o EasyPanel injeta 80); o padrão local é 3000.

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Variáveis NEXT_PUBLIC_* são embutidas no build: mudou o valor, precisa rebuildar.
# Sem Supabase o app sobe em modo demonstração.
# Padrão de produção: gerevendas.com.br/ads. Para servir na raiz, passe NEXT_PUBLIC_BASE_PATH vazio.
ARG NEXT_PUBLIC_APP_URL=https://gerevendas.com.br
ARG NEXT_PUBLIC_BASE_PATH=/ads
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ARG NEXT_PUBLIC_BASE_PATH=/ads
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
# O EasyPanel injeta PORT (padrão 80); o servidor segue essa variável.
EXPOSE 3000
# Sem HEALTHCHECK na imagem: no Swarm (EasyPanel) uma checagem reprovada tira o container do
# roteamento. Para monitorar, use ${NEXT_PUBLIC_BASE_PATH}/api/health no painel ou num uptime checker.
# O Swarm (EasyPanel) pode sobrescrever HOSTNAME com o id do container; força escutar em todas as interfaces.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
