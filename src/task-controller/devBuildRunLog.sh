#!/bin/bash

DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"

cd $DIR

git pull
docker build -t multipaas-ctrl:0.9 .
if [ "$1" == "save" ]; then
    docker save -o ../../install/build/ubuntu_bionic/docker-images/multipaas-ctrl-0.9.tar multipaas-ctrl:0.9
fi
docker rm -f multipaas-ctrl
docker run -d \
    --name multipaas-ctrl \
    --restart unless-stopped \
    --network host \
    -e DB_HOST=192.168.68.149 \
    -e DB_USER=postgres \
    -e DB_PASS=li14ebe14 \
    -e MOSQUITTO_IP=192.168.68.149 \
    -e DHCP_OVERWRITE=true \
    -e DHCP_MASK=192.168.68 \
    -e DHCP_RESERVED=[250,251,252,253,254,12] \
    -e DHCT_USE_PING=true \
    -e NGINX_HOST_IP=192.168.68.149 \
    -e ENABLE_NGINX_STREAM_DOMAIN_NAME=true \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v $HOME/.multipaas/nginx:/usr/src/app/nginx \
    -v $NGINX_USERS_CRT_FOLDER:/certs \
    multipaas-ctrl:0.9

cd "$_PWD" 

docker logs -f multipaas-ctrl
