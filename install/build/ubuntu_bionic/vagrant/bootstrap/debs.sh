#!/bin/bash

dependency_dl_exists() {
    local _EXISTS=""
    
    if [ -d "$1" ]; then
        if [ -n "$(ls $1)" ]; then 
            if [ -d "$1/dependencies" ]; then
                if [ -n "$(ls $1/dependencies)" ]; then 
                    _EXISTS="OK"
                fi
            else
                _EXISTS="OK"
            fi

        fi
    fi
    echo $_EXISTS
}

# DOCKER
if [ -z "$(dependency_dl_exists /var/tmp/debs/containerd)" ]; then
    mkdir /var/tmp/debs/containerd
    wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/containerd.io_1.2.6-3_amd64.deb -O /var/tmp/debs/containerd/containerd.io_1.2.6-3_amd64.deb
fi

if [ -z "$(dependency_dl_exists /var/tmp/debs/docker-ce-cli)" ]; then
    mkdir /var/tmp/debs/docker-ce-cli
    wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/docker-ce-cli_19.03.9~3-0~ubuntu-bionic_amd64.deb -O /var/tmp/debs/docker-ce-cli/docker-ce-cli_19.03.9~3-0~ubuntu-bionic_amd64.deb
fi

if [ -z "$(dependency_dl_exists /var/tmp/debs/docker-ce)" ]; then
    mkdir /var/tmp/debs/docker-ce
    wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/docker-ce_19.03.9~3-0~ubuntu-bionic_amd64.deb -O /var/tmp/debs/docker-ce/docker-ce_19.03.9~3-0~ubuntu-bionic_amd64.deb
fi

# VIRTUALBOX
wget -q https://www.virtualbox.org/download/oracle_vbox_2016.asc -O- | sudo apt-key add -
wget -q https://www.virtualbox.org/download/oracle_vbox.asc -O- | sudo apt-key add -
echo "deb [arch=amd64] http://download.virtualbox.org/virtualbox/debian $(lsb_release -sc) contrib" | sudo tee /etc/apt/sources.list.d/virtualbox.list
apt update -y

# VAGRANT
if [ -z "$(dependency_dl_exists /var/tmp/debs/vagrant)" ]; then
    mkdir /var/tmp/debs/vagrant
    wget curl -O https://releases.hashicorp.com/vagrant/2.2.6/vagrant_2.2.6_x86_64.deb -O /var/tmp/debs/vagrant/vagrant_2.2.6_x86_64.deb
fi

# GITLAB-RUNNER
curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash

_CPWD=$(pwd)
download_deb() {
    if [ -z "$(dependency_dl_exists /var/tmp/debs/$1)" ]; then
        mkdir /var/tmp/debs/$1
        echo "==> Downloading package $1"
        cd /var/tmp/debs/$1
        for i in $(apt-cache depends $1 | grep -E 'Depends|Recommends|Suggests' | cut -d ':' -f 2,3 | sed -e s/'<'/''/ -e s/'>'/''/); do apt-get download $i 2>>errors.txt; done
        apt-get install $1 --print-uris --reinstall --yes | sed -n "s/^'\([^']*\)'.*$/\1/p" > ./debs.txt
        _IFS=$'\r\n' GLOBIGNORE='*' command eval  'DEP_ARR=($(cat ./debs.txt))'
        for PACKAGE in "${DEP_ARR[@]}"; do :
            wget -nc $PACKAGE 
        done
        rm -rf ./debs.txt
    else
        echo "==> $1 already present, skipping download"
    fi
}

IFS=$'\r\n' GLOBIGNORE='*' command eval  'DEB_LIST=($(cat /var/tmp/debs/deb-list.cfg))'
for PACKAGE in "${DEB_LIST[@]}"; do :
    if [[ "$PACKAGE" =~ ^#.*  ]]; then
        echo "==> Skipping dep $PACKAGE"
    else
        download_deb $PACKAGE
    fi
done
cd $_CPWD