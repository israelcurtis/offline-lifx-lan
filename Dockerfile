FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV APP_STATE_DIR=/state

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --loglevel=info

COPY src ./src
COPY public ./public
COPY shared ./shared
COPY defaults/options.json ./defaults/options.json
COPY defaults/scenes.json ./defaults/scenes.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

RUN mkdir -p ./state

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "start"]
