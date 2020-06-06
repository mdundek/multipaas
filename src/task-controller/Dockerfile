FROM node:12.16.2

RUN apt-get update
RUN apt-get -y install apt-transport-https ca-certificates curl gnupg2 software-properties-common
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | apt-key add -
RUN add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/debian $(lsb_release -cs) stable"

RUN apt-get update
RUN apt-get -y install docker-ce

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

VOLUME /usr/src/app/nginx

# Database credentials
ENV DB_HOST=192.168.0.99
ENV DB_PORT=5432
ENV DB_USER=postgres
ENV DB_PASS=postgrespass

# MQTT engine
ENV MOSQUITTO_IP=192.168.0.99
ENV MOSQUITTO_PORT=1883

# What subnet is MultiPaaS installed on, along with the reserved IPs
ENV DHCP_OVERWRITE=true
ENV DHCP_USE_PING=true
ENV DHCP_RESERVED=[250,251,252,253,254]
ENV DHCP_MASK=192.168.0

ENV CLUSTER_ENGINE=virtualbox

ENV NGINX_HOST_IP=192.168.0.99

CMD [ "node", "." ]