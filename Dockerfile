FROM node:26-bookworm-slim
WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .
RUN build_data="$(mktemp -d)" && \
    SHOP_DB_PATH="$build_data/shop.sqlite" \
    SHOP_UPLOAD_DIR="$build_data/uploads" npm run build && \
    rm -rf "$build_data" && mkdir -p /app/.data

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
