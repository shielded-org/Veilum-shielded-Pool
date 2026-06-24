FROM node:20-slim

WORKDIR /app

# Monorepo install (indexer only needs @stellar/stellar-sdk from workspace)
COPY package.json package-lock.json* ./
COPY services/indexer/package.json ./services/indexer/
RUN npm install --workspace @stellar-shielded/indexer

COPY services/indexer ./services/indexer
COPY apps/web/public/deployment.json ./apps/web/public/deployment.json
COPY scripts/deployment.json ./scripts/deployment.json

WORKDIR /app/services/indexer

ENV INDEXER_HOST=0.0.0.0
ENV INDEXER_DATA_DIR=/data
ENV PORT=8080

EXPOSE 8080

CMD ["node", "src/server.js"]
