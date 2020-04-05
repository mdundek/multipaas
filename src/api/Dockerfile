FROM node:12

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

VOLUME /usr/src/app/data

ENV DB_HOST=192.168.0.99
ENV DB_PORT=5432
ENV DB_USER=postgres
ENV DB_PASS=postgrespass

# MQTT engine
ENV MOSQUITTO_IP=192.168.0.99
ENV MOSQUITTO_PORT=1883

ENV REGISTRY_IP=192.168.0.99
ENV CRYPTO_KEY=YDbxyG16Q6ujlCpjXH2Pq7nPAtJF66jLGwx4RYkHqhY=

# MyCloud sysadmin credentials
ENV API_SYSADMIN_USER=mycloudadmin
ENV API_SYSADMIN_PASSWORD=mycloudpass

ENV APP_TMP_DIR=/usr/src/app/data/tmp

EXPOSE 3030
EXPOSE 3000

CMD [ "node", "src/" ]