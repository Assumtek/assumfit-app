# Build em dois estágios.
#
# A imagem final não carrega toolchain de compilação nem devDependencies. O
# `argon2` precisa de python3/make/g++ para compilar o módulo nativo, e manter
# um compilador na imagem que roda em produção aumenta a superfície de ataque e
# o tamanho sem servir a nada depois do build.

FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# `--omit=dev` deixa de fora typescript, ts-node-dev e afins. O CLI do Prisma
# permanece porque `migrate deploy` roda na subida do contêiner.
COPY package*.json ./
COPY prisma ./prisma
RUN apk add --no-cache python3 make g++ \
  && npm ci --omit=dev \
  && npx prisma generate \
  && apk del python3 make g++ \
  && npm cache clean --force

COPY --from=build /app/dist ./dist

# Não roda como root — a imagem do Node já traz o usuário `node`. Um processo
# comprometido rodando como root escreve em qualquer lugar do contêiner.
USER node

EXPOSE 3001

# `node` direto, não `npm start`: com o npm no meio, o SIGTERM chega ao npm e
# não ao processo que registra o handler de encerramento, e o contêiner morre
# por SIGKILL cortando requisições em voo.
CMD ["node", "dist/server.js"]
