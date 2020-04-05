#!/bin/bash

_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"

cd $_DIR && cd ../../workplaces/$1/$2

_onError () {
    vagrant halt
    vagrant destroy --force
}

echo "[TASK 0] Start VM"
vagrant up
if [ $? -eq 0 ]; then
    echo "[TASK FINAL] Make master node also a worker node"
    sleep 5
    vagrant ssh -c "kubectl taint nodes --all node-role.kubernetes.io/master-" 2>/dev/null
    if [ $? -eq 1 ]; then
        echo "[ERROR] Could not untaint master node workplaces/$1/$2"
        _onError
    fi

    vagrant ssh -c "kubectl create secret docker-registry regcred --docker-server=registry.mycloud.org:5043 --docker-username=$3 --docker-password=$4 --docker-email=mycloud@mycloud.com" 2>/dev/null
    if [ $? -eq 1 ]; then
        echo "[ERROR] Could not create private registry secret"
        _onError
    fi
    echo "[DONE]"
else
    echo "[ERROR] Could not deploy the master node workplaces/$1/$2"
    _onError
    echo "[DONE]"
fi

cd "$_PWD"