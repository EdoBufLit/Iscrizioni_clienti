FROM node:20-alpine AS builder

ARG EVOLUTION_LITE_REPO=https://github.com/EvolutionAPI/evolution-api-lite.git
ARG EVOLUTION_LITE_COMMIT=d6131d7

RUN apk update && \
    apk add git wget curl bash openssl dos2unix

WORKDIR /tmp
RUN git clone "${EVOLUTION_LITE_REPO}" evolution
WORKDIR /tmp/evolution
RUN git checkout "${EVOLUTION_LITE_COMMIT}"

COPY scripts/patch_evolution_lite.js /tmp/patch_evolution_lite.js
RUN node /tmp/patch_evolution_lite.js /tmp/evolution

LABEL version="2.2.1-assonam-patched" description="ASSONAM-patched Evolution API Lite with chat/history fixes."

WORKDIR /evolution

COPY --from=builder /tmp/evolution/package.json ./package.json
COPY --from=builder /tmp/evolution/package-lock.json ./package-lock.json
COPY --from=builder /tmp/evolution/tsconfig.json ./tsconfig.json

RUN npm install

COPY --from=builder /tmp/evolution/src ./src
COPY --from=builder /tmp/evolution/public ./public
COPY --from=builder /tmp/evolution/prisma ./prisma
COPY --from=builder /tmp/evolution/.env.example ./.env
COPY --from=builder /tmp/evolution/runWithProvider.js ./
COPY --from=builder /tmp/evolution/tsup.config.ts ./
COPY --from=builder /tmp/evolution/Docker ./Docker

RUN chmod +x ./Docker/scripts/* && dos2unix ./Docker/scripts/*
RUN ./Docker/scripts/generate_database.sh
RUN npm run build

FROM node:20-alpine AS final

RUN apk update && \
    apk add tzdata bash openssl

ENV TZ=America/Sao_Paulo
ENV DOCKER_ENV=true

WORKDIR /evolution

COPY --from=builder /evolution/package.json ./package.json
COPY --from=builder /evolution/package-lock.json ./package-lock.json
COPY --from=builder /evolution/node_modules ./node_modules
COPY --from=builder /evolution/dist ./dist
COPY --from=builder /evolution/prisma ./prisma
COPY --from=builder /evolution/public ./public
COPY --from=builder /evolution/.env ./.env
COPY --from=builder /evolution/Docker ./Docker
COPY --from=builder /evolution/runWithProvider.js ./runWithProvider.js
COPY --from=builder /evolution/tsup.config.ts ./tsup.config.ts

EXPOSE 8080

ENTRYPOINT ["/bin/bash", "-c", ". ./Docker/scripts/deploy_database.sh && npm run start:prod" ]
