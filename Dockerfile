# app_dev/Dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./

# npm 오류의 99%는 여기서 해결됨
RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
