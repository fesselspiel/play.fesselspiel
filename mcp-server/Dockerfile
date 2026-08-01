FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY PROMPT.md MEMORY.md ./

EXPOSE 8090
CMD ["node", "src/index.js"]
