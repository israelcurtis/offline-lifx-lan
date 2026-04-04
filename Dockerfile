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

HEALTHCHECK --interval=60s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "const req = require('node:http').get('http://127.0.0.1:3000/api/status', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1)); req.setTimeout(4000, () => { req.destroy(); process.exit(1); });"]

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "start"]
