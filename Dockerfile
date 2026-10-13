FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server ./server
COPY web ./web
RUN mkdir -p /var/data && chown -R node:node /app /var/data
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
