#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"

cd $DIR

git pull
docker build -t multipaas-api:0.9 .
if [ "$1" == "save" ]; then
    docker save -o ../../install/build/ubuntu_bionic/docker-images/multipaas-api-0.9.tar multipaas-api:0.9
fi
docker rm -f multipaas-api
docker run -d \
    --name multipaas-api \
    --restart unless-stopped \
    --network host \
    -e DB_HOST=192.168.1.101 \
    -e NGINX_HOST_IP=192.168.1.101 \
    -e DB_USER=postgres \
    -e DB_PASS=multipaas2020 \
    -e MOSQUITTO_IP=192.168.1.101 \
    -e API_SYSADMIN_USER=multipaas@gmail.com \
    -e API_SYSADMIN_PASSWORD=multipaas2020 \
    -e REGISTRY_IP=192.168.1.101 \
    -e CRYPTO_KEY=YDbxyG16Q6ujlCpjXH2Pq7nPAtJF66jLGwx4RYkHqhY= \
    -e ENABLE_NGINX_STREAM_DOMAIN_NAME=true \
    -e MP_SERVICES_DIR=/usr/src/app/data/mp_services \
    -v /home/vagrant/multipaas:/usr/src/app/data \
    -v /opt/docker/containers/docker-registry/auth:/usr/src/app/auth-docker \
    -v /opt/docker/containers/nginx-registry/auth:/usr/src/app/auth-nginx \
    multipaas-api:0.9

cd "$_PWD" 

docker logs -f multipaas-api