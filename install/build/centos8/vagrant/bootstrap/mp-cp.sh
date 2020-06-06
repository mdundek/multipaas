#!/bin/bash

NODE_IMG_EXISTS=$(docker images node:12.6.2 | sed -n '1!p')
if [ "$NODE_IMG_EXISTS" == "" ] && [ -f /var/tmp/docker-images/node-12.16.2.tar ]; then
    docker load --input /var/tmp/docker-images/node-12.16.2.tar
fi

# Build & export multipaas docker images
cd /home/vagrant/multipaas/src/api
rm -rf node_modules
rm -rf package-lock.json
docker build -t multipaas-api:0.9 .
if [ $? -ne 0 ]; then
    echo "Error building MultiPaaS API docker image"
    exit 1
fi
docker save -o /var/tmp/docker-images/multipaas-api-0.9.tar multipaas-api:0.9
docker rmi multipaas-api:0.9
docker images purge

cd /home/vagrant/multipaas/src/task-controller
rm -rf node_modules
rm -rf package-lock.json
docker build -t multipaas-ctrl:0.9 .
if [ $? -ne 0 ]; then
    echo "Error building MultiPaaS Ctrl docker image"
    exit 1
fi
docker save -o /var/tmp/docker-images/multipaas-ctrl-0.9.tar multipaas-ctrl:0.9
docker rmi multipaas-ctrl:0.9
docker images purge