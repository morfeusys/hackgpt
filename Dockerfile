FROM node:19

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY index.js .
COPY stopwords.txt .
COPY swagger.yaml .
COPY modules ./modules

EXPOSE 8000
CMD ["npm", "start"]