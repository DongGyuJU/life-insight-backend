# app_dev/Dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./

# npm 오류 해결을 위함.
RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
