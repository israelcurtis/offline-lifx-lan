FROM node:20-slim

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
ENV APP_STATE_DIR=/state
ENV NODE_MAX_OLD_SPACE_SIZE=80

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

EXPOSE 3001

HEALTHCHECK --interval=5m --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "const req = require('node:http').get('http://127.0.0.1:3001/api/status', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.setTimeout(4000, () => { req.destroy(); process.exit(1); });"]

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "src/launcher.js"]
