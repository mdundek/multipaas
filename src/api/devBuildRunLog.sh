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
    -e MP_MODE=unipaas \
    -e DB_HOST=192.168.1.12 \
    -e NGINX_HOST_IP=192.168.1.12 \
    -e DB_USER=postgres \
    -e DB_PASS=li14ebe14 \
    -e MOSQUITTO_IP=192.168.1.12 \
    -e API_SYSADMIN_USER=mdundek@gmail.com \
    -e API_SYSADMIN_PASSWORD=li14ebe14 \
    -e REGISTRY_IP=192.168.1.12 \
    -e CRYPTO_KEY=YDbxyG16Q6ujlCpjXH2Pq7nPAtJF66jLGwx4RYkHqhY= \
    -e ENABLE_NGINX_STREAM_DOMAIN_NAME=true \
    -e MP_SERVICES_DIR=/usr/src/app/data/mp_services \
    -v $HOME/multipaas:/usr/src/app/data \
    -v $HOME/.multipaas/auth/registry:/usr/src/app/auth-docker \
    -v $HOME/.multipaas/auth/nginx:/usr/src/app/auth-nginx \
    multipaas-api:0.9

cd "$_PWD" 

docker logs -f multipaas-api