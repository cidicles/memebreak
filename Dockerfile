# Production image: serves the prebuilt ./dist plus the co-op WebSocket server.
# Build the client first (`npm run build`); only `ws` is needed at runtime.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY dist ./dist
EXPOSE 8080
USER node
CMD ["node", "server/index.js"]
