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
    echo "[TASK W.1] Join worker to the cluster on IP $3"
    sshpass -p 'vagrant' ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@$3 /home/vagrant/gentoken.sh
    if [ $? -ne 0 ]; then
        echo "[ERROR] Could not generate join script, workplaces/$1/$2"
        _onError
        echo "[DONE]"
        exit 0
    fi

    sleep 1
    vagrant ssh -c "sshpass -p 'kubeadmin' sudo scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no vagrant@$3:/joincluster.sh /joincluster.sh"
    if [ $? -eq 0 ]; then
        vagrant ssh -c "sudo bash /joincluster.sh" 2>/dev/null
        if [ $? -eq 0 ]; then
            # vagrant ssh -c "kubectl create secret docker-registry regcred --docker-server=registry.mycloud.org:5043 --docker-username=$4 --docker-password=$5 --docker-email=mycloud@mycloud.com"
            # if [ $? -eq 1 ]; then
            #     echo "[ERROR] Could not create private registry secret"
            #     _onError
            # fi
            echo "[DONE]"
         else
            echo "[ERROR] Could not join cluster node, workspace/$1/$2"
            _onError
            echo "[DONE]"
        fi
    else
        echo "[ERROR] Could not grab cluster join script from master, workplaces/$1/$2"
        _onError
        echo "[DONE]"
    fi
else
    echo "[ERROR] Could not deploy the worker node, workplaces/$1/$2"
    _onError
    echo "[DONE]"
fi

cd "$_PWD"