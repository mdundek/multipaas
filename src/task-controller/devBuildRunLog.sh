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
    -e DB_HOST=192.168.1.101 \
    -e DB_USER=postgres \
    -e DB_PASS=multipaas2020 \
    -e MOSQUITTO_IP=192.168.1.101 \
    -e DHCP_OVERWRITE=true \
    -e DHCP_MASK=192.168.1 \
    -e DHCP_RESERVED=[250,251,252,253,254,101] \
    -e DHCT_USE_PING=true \
    -e NGINX_HOST_IP=192.168.1.101 \
    -e ENABLE_NGINX_STREAM_DOMAIN_NAME=true \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v /home/vagrant/.multipaas/nginx:/usr/src/app/nginx \
    -v /opt/docker/containers/nginx/certs/users:/certs \
    multipaas-ctrl:0.9

cd "$_PWD" 

docker logs -f multipaas-ctrl
