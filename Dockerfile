FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

WORKDIR /app

# Install Chromium deps (Patchright bundles Chrome but needs system libs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libatspi2.0-0 fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

# Copy lockfile + manifests for cache-friendly install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/control/package.json apps/control/
COPY apps/worker/package.json apps/worker/
COPY packages/agent-loop/package.json packages/agent-loop/
COPY packages/browser-core/package.json packages/browser-core/
COPY packages/budget/package.json packages/budget/
COPY packages/identity-vault/package.json packages/identity-vault/
COPY packages/playbook-store/package.json packages/playbook-store/
COPY packages/shared/package.json packages/shared/
COPY db/package.json db/

RUN pnpm install --frozen-lockfile

COPY . .

# Patchright bundled chromium
RUN pnpm --filter @lynx/browser-core exec patchright install chromium

ENV NODE_ENV=production
EXPOSE 3000

# Default to control; override CMD for worker machines.
CMD ["pnpm", "--filter", "@lynx/control", "start"]
