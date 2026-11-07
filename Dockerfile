# BANANA CLIPS AI STUDIO — Unified Next.js Web + API + Workers + FFmpeg + AI Pipeline
FROM node:22-bookworm-slim

WORKDIR /app

# Install FFmpeg (with libx264, aac, libass), Python 3, curl, ca-certificates, and latest yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

COPY package.json tsconfig.json ./
COPY packages ./packages
COPY workers ./workers
COPY apps ./apps

# Install all monorepo dependencies and link @banana/* packages
RUN npm install --no-audit --no-fund && \
    mkdir -p node_modules/@banana && \
    ln -s /app/packages/config node_modules/@banana/config && \
    ln -s /app/packages/video-types node_modules/@banana/video-types && \
    ln -s /app/packages/shared node_modules/@banana/shared && \
    ln -s /app/packages/database node_modules/@banana/database && \
    ln -s /app/workers node_modules/@banana/workers

# Build Next.js production bundle
RUN npm --prefix apps/web run build

COPY infrastructure/docker/start-unified.sh /app/start-unified.sh
RUN sed -i 's/\r$//' /app/start-unified.sh && chmod +x /app/start-unified.sh

VOLUME ["/data/media", "/data/models", "/data/pgdata"]
EXPOSE 3000 4000 8000

CMD ["/app/start-unified.sh"]
