FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install
# Installs the actual Chromium binary + every OS-level dependency it needs
# (fonts, codecs, etc.) — far more reliable than hand-picking apt packages,
# and stays correct automatically if the playwright version bumps.
RUN npx playwright install --with-deps chromium

COPY . .

EXPOSE 8200

# Persistent HTTP service (see server.js) — exposes /scan for saga-api to
# trigger on demand, plus its own weekly timer. Override with
# `docker run saga-grocery-scanner node scan.js` for a one-off CLI scan.
CMD ["node", "server.js"]
