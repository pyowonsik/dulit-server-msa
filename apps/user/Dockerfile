# FROM node:alpine AS development
FROM node:20-alpine AS development


WORKDIR /usr/src/app

COPY package*.json ./

COPY pnpm-lock.yaml ./

RUN npm install -g @nestjs/cli

RUN npm i -g pnpm

RUN pnpm i

COPY . .

CMD ["pnpm","start:dev","user"]