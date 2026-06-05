FROM node:20-alpine

# Build deps for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# These must be passed at build time so Vite bakes them into the bundle
ARG VITE_API_TOKEN
ARG VITE_GEMINI_API_KEY
ARG VITE_TROVE_API_KEY
ARG VITE_LOGO_API_KEY

ENV VITE_API_TOKEN=$VITE_API_TOKEN
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY
ENV VITE_TROVE_API_KEY=$VITE_TROVE_API_KEY
ENV VITE_LOGO_API_KEY=$VITE_LOGO_API_KEY

RUN npm run build

EXPOSE 3001
CMD ["npm", "start"]
