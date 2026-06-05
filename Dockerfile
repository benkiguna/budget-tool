FROM node:20-alpine

# Build deps for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# VITE_API_TOKEN must be passed at build time so Vite bakes it into the bundle
ARG VITE_API_TOKEN
ENV VITE_API_TOKEN=$VITE_API_TOKEN

RUN npm run build

EXPOSE 3001
CMD ["npm", "start"]
