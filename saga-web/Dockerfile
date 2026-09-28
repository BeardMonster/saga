FROM node:22-slim AS dev
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 5180
CMD ["npm", "run", "dev"]
