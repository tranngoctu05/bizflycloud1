#* ✈️ Production 
FROM node:20-alpine AS dev

WORKDIR /app

COPY package*.json .

RUN npm install

COPY . .

EXPOSE 8989

CMD [ "npm", "run", "start" ]