#!/bin/bash

_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"

cd $_DIR

docker build -t mycloud-api:$1 .
docker tag mycloud-api:$1 mdcloud.registry.com:5000/mycloud-api:$1
docker push mdcloud.registry.com:5000/mycloud-api:$1

DEP_MYCLOUD=$(kubectl get deployments | grep "mycloud-api-deployment")
if [ "$DEP_MYCLOUD" != "" ]
then
    kubectl scale --replicas=0 deployment mycloud-api-deployment
    kubectl scale --replicas=1 deployment mycloud-api-deployment
else
    kubectl apply -f ../../core/deploy/components-k8s/deployMyCloud/deployment.yml
fi

cd $_PWD