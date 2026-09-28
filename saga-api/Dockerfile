FROM node:22-slim AS dev
WORKDIR /app
RUN apt-get update -qq && apt-get install -y -qq openssl tesseract-ocr ffmpeg python3-pip && rm -rf /var/lib/apt/lists/*
# yt-dlp: downloads a video's audio from a link (YouTube etc.) for the
# insult-clip importer (see lib/ai/ytdlp.ts). Installed via pip rather than
# Debian's own package, which is years stale — yt-dlp needs to track
# frequent site changes to keep working at all.
RUN pip install --no-cache-dir --break-system-packages yt-dlp
# The Claude Code CLI itself — used headlessly (claude -p ...) as a
# last-resort provider authenticated via CLAUDE_CODE_OAUTH_TOKEN (a
# Pro/Max subscription token, not a paid API key).
RUN npm install -g @anthropic-ai/claude-code
COPY package.json ./
RUN npm install
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "dev"]
