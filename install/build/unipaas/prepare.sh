#!/bin/bash

####################### Position to script folder
_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"
cd $_DIR

err_log=$_DIR/std.log

. ../../_libs/common.sh
. ../../_libs/distro.sh
. ../../_libs/dep_online.sh
. ../../_libs/update.sh

########################################
# CHECK DEPS FILES
########################################
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

########################################
# DOWNLOAD DEPS
########################################
download_deb() {
    if [ -z "$(dependency_dl_exists $OFFLINE_FOLDER/debs/$1)" ]; then
        mkdir $OFFLINE_FOLDER/debs/$1
        echo "==> Downloading package $1"
        cd $OFFLINE_FOLDER/debs/$1
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

########################################
# DOWNLOAD DOCKER IMAGES
########################################
fetch_docker_images() {
    if [ ! -f ../offline_files/docker_images/$3-$2.tar ]; then
        echo "==> Downloading image $1:$2"
        docker pull $1:$2
        docker save -o ../offline_files/docker_images/$3-$2.tar $1:$2
        docker rmi $1:$2
        docker images purge
    else
        echo "==> Image $1:$2 already present, skipping"
    fi
}

########################################
# RESOLVE DEPEENDENCIES
########################################
dependencies () {
    log "==> This script will download all required files to install MultiPaaS in single tenant mode for online/offline environements.\n"
    log "\n"
    read_input "Do you wish to continue (y/n)?" CONTINUE_INSTALL
    while [[ "$CONTINUE_INSTALL" != 'y' ]] && [[ "$CONTINUE_INSTALL" != 'n' ]]; do
        read_input "Invalide answer, try again (y/n)?" CONTINUE_INSTALL
    done
    if [ "$CONTINUE_INSTALL" == "n" ]; then
        exit 0
    fi

    sudo echo "" # Ask user for sudo password now

    NODE_EXISTS=$(command -v node)
    if [ "$NODE_EXISTS" == "" ]; then
        curl -sL https://deb.nodesource.com/setup_12.x -o nodesource_setup.sh
        sudo bash nodesource_setup.sh
        sudo apt install -y nodejs
    fi

    NPM_BUNDLE_EXISTS=$(command -v npm-bundle)
    if [ "$NPM_BUNDLE_EXISTS" == "" ]; then
        sudo npm install npm-bundle -g
    fi

    
    dep_wget &>>$err_log &
    bussy_indicator "Dependency on \"wget\"..."
    log "\n"

    # DOCKER
    if [ -z "$(dependency_dl_exists $OFFLINE_FOLDER/debs/containerd)" ]; then
        mkdir $OFFLINE_FOLDER/debs/containerd
        wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/containerd.io_1.2.6-3_amd64.deb -O $OFFLINE_FOLDER/debs/containerd/containerd.io_1.2.6-3_amd64.deb
    fi

    if [ -z "$(dependency_dl_exists $OFFLINE_FOLDER/debs/docker-ce-cli)" ]; then
        mkdir $OFFLINE_FOLDER/debs/docker-ce-cli
        wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/docker-ce-cli_19.03.9~3-0~ubuntu-bionic_amd64.deb -O $OFFLINE_FOLDER/debs/docker-ce-cli/docker-ce-cli_19.03.9~3-0~ubuntu-bionic_amd64.deb
    fi

    if [ -z "$(dependency_dl_exists $OFFLINE_FOLDER/debs/docker-ce)" ]; then
        mkdir $OFFLINE_FOLDER/debs/docker-ce
        wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/docker-ce_19.03.9~3-0~ubuntu-bionic_amd64.deb -O $OFFLINE_FOLDER/debs/docker-ce/docker-ce_19.03.9~3-0~ubuntu-bionic_amd64.deb
    fi

    # Nodejs
    if [ -z "$(dependency_dl_exists $OFFLINE_FOLDER/debs/nodejs)" ]; then
        mkdir $OFFLINE_FOLDER/debs/nodejs
        wget https://nodejs.org/dist/v12.18.0/node-v12.18.0-linux-x64.tar.xz -O $OFFLINE_FOLDER/debs/nodejs/node-v12.18.0-linux-x64.tar.xz
    fi
    
    DOCKER_EXISTS=$(command -v docker)
    if [ "$DOCKER_EXISTS" == "" ]; then
        sudo dpkg -i $OFFLINE_FOLDER/debs/containerd/*.deb
        sudo dpkg -i $OFFLINE_FOLDER/debs/docker-ce-cli/*.deb
        sudo dpkg -i $OFFLINE_FOLDER/debs/docker-ce/*.deb
        sudo gpasswd -a $USER docker
    fi
    
}


########################################
# BUILD FOR TARGET UBUNTU
########################################
build_for_ubuntu_bionic() {
    cd $_DIR
    sudo chown _apt /var/lib/update-notifier/package-data-downloads/partial/

    
    

    # GITLAB-RUNNER
    curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash

    # KUBERNETES
    curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add
    apt-add-repository "deb http://apt.kubernetes.io/ kubernetes-xenial main"

    _CPWD=$(pwd)

    download_deb kubeadm
    download_deb kubelet
    download_deb kubectl
    download_deb sshpass

    

    cd $_CPWD

    # Download docker images
    # Clear layer cach to prevent stuck corrupt image layers
    sudo systemctl stop docker
    sudo rm -rf /var/lib/docker
    sudo systemctl start docker
    sleep 2

    IFS=$'\r\n' GLOBIGNORE='*' command eval  'DIMG_LIST=($(cat ../offline_files/docker_images/image-list.cfg))'
    for PACKAGE in "${DIMG_LIST[@]}"; do :
        if [[ "$PACKAGE" =~ ^#.*  ]]; then
            echo "Skipping image $PACKAGE"
        else
            D_IMG=$(echo $PACKAGE | cut -d' ' -f1)
            D_VER=$(echo $PACKAGE | cut -d' ' -f2)
            F_NAME=$(echo $PACKAGE | cut -d' ' -f3)
            fetch_docker_images $D_IMG $D_VER $F_NAME
        fi
    done
}

########################################
# LOGIC...
########################################
/usr/bin/clear

base64 -d <<<"IF9fICBfXyAgICAgIF8gXyAgIF8gX19fICAgICAgICAgICBfX18gX19fICAgICAgXyBfICAgIF8gICAgICAgICAKfCAgXC8gIHxfICBffCB8IHxfKF8pIF8gXF9fIF8gX18gXy8gX198IF8gKV8gIF8oXykgfF9ffCB8X19fIF8gXyAKfCB8XC98IHwgfHwgfCB8ICBffCB8ICBfLyBfYCAvIF9gIFxfXyBcIF8gXCB8fCB8IHwgLyBfYCAvIC1fKSAnX3wKfF98ICB8X3xcXyxffF98XF9ffF98X3wgXF9fLF9cX18sX3xfX18vX19fL1xfLF98X3xfXF9fLF9cX19ffF98ICA="
log "\n\n"

# Determine current distro
distro
if [ "$DISTRO" != "ubuntu" ] || [ "$MAJ_V" != "18.04" ]; then
    echo "Unsupported OS. This script only works on Ubuntu 18.04"
    exit 1
fi

OFFLINE_FOLDER="$(dirname "$_DIR")/offline_files"

# Install dependencies
dependencies
log "\n"

build_for_ubuntu_bionic
log "\n"





sudo swapoff -a







log "\n"
success "Build process done! You can now proceed to the installation of the control-plane as well as the host-node.\n"

# Go back to initial folder
cd "$_PWD"







# dpkg -i ../offline_files/debs/containerd/*.deb
# dpkg -i ../offline_files/debs/docker-ce-cli/*.deb
# dpkg -i ../offline_files/debs/docker-ce/*.deb

# dpkg -i ../offline_files/debs/kubeadm/*.deb
# dpkg -i ../offline_files/debs/kubectl/*.deb
# dpkg -i ../offline_files/debs/kubelet/*.deb

# swapoff –a
# hostnamectl set-hostname master-node
