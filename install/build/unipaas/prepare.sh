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

    dep_wget &>>$err_log &
    bussy_indicator "Dependency on \"wget\"..."
    log "\n"

    dep_node &>>$err_log &
    bussy_indicator "Dependency on \"node\"..."
    log "\n"

    dep_npm_bundle &>>$err_log &
    bussy_indicator "Dependency on \"npm_bundle\"..."
    log "\n"

    dep_docker &>>$err_log &
    bussy_indicator "Dependency on \"docker\"..."
    log "\n"
    
}


########################################
# BUILD FOR TARGET UBUNTU
########################################
build_for_ubuntu_bionic() {
    cd $_DIR
    sudo chown _apt /var/lib/update-notifier/package-data-downloads/partial/

    ########## Download binaries

    _CPWD=$(pwd)
    
    # Nodejs
    if [ -z "$(dependency_dl_exists $OFFLINE_FOLDER/debs/nodejs)" ]; then
        mkdir $OFFLINE_FOLDER/debs/nodejs
        wget https://nodejs.org/dist/v12.18.0/node-v12.18.0-linux-x64.tar.xz -O $OFFLINE_FOLDER/debs/nodejs/node-v12.18.0-linux-x64.tar.xz &>>$err_log &
        bussy_indicator "Adding repo NodeJS 12..."
        log "\n"
    fi

    # DOCKER
    if [ -z "$(dependency_dl_exists $OFFLINE_FOLDER/debs/containerd)" ]; then
        mkdir $OFFLINE_FOLDER/debs/containerd
        wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/containerd.io_1.2.6-3_amd64.deb -O $OFFLINE_FOLDER/debs/containerd/containerd.io_1.2.6-3_amd64.deb &>>$err_log &
        bussy_indicator "Adding repo Containerd..."
        log "\n"
    fi

    if [ -z "$(dependency_dl_exists $OFFLINE_FOLDER/debs/docker-ce-cli)" ]; then
        mkdir $OFFLINE_FOLDER/debs/docker-ce-cli
        wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/docker-ce-cli_19.03.9~3-0~ubuntu-bionic_amd64.deb -O $OFFLINE_FOLDER/debs/docker-ce-cli/docker-ce-cli_19.03.9~3-0~ubuntu-bionic_amd64.deb &>>$err_log &
        bussy_indicator "Adding repo docker-ce-cli..."
        log "\n"
    fi

    if [ -z "$(dependency_dl_exists $OFFLINE_FOLDER/debs/docker-ce)" ]; then
        mkdir $OFFLINE_FOLDER/debs/docker-ce
        wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/docker-ce_19.03.9~3-0~ubuntu-bionic_amd64.deb -O $OFFLINE_FOLDER/debs/docker-ce/docker-ce_19.03.9~3-0~ubuntu-bionic_amd64.deb &>>$err_log &
        bussy_indicator "Adding repo docker-ce..."
        log "\n"
    fi
    
    # GITLAB-RUNNER
    curl -s -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash &>>$err_log &
    bussy_indicator "Adding repo gitlab-runner..."
    log "\n"

    # KUBERNETES
    curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add &>>$err_log &
    bussy_indicator "Adding repo key K8S..."
    log "\n"

    sudo apt-add-repository "deb http://apt.kubernetes.io/ kubernetes-xenial main" &>>$err_log &
    bussy_indicator "Adding repo K8S..."
    log "\n"

    # Add Gluster repo
    sudo add-apt-repository -y ppa:gluster/glusterfs-5 &>>$err_log &
    bussy_indicator "Adding repo GlusterFS..."
    log "\n"

    sudo apt update -y &>>$err_log &
    bussy_indicator "Updating repos..."
    log "\n"

    download_deb kubeadm &>>$err_log &
    bussy_indicator "Downloading repo kubeadm..."
    log "\n"

    download_deb kubelet &>>$err_log &
    bussy_indicator "Downloading repo kubelet..."
    log "\n"

    download_deb kubectl &>>$err_log &
    bussy_indicator "Downloading repo kubectl..."
    log "\n"

    download_deb sshpass &>>$err_log &
    bussy_indicator "Downloading repo sshpass..."
    log "\n"

    download_deb unzip &>>$err_log &
    bussy_indicator "Downloading repo unzip..."
    log "\n"

    download_deb jq &>>$err_log &
    bussy_indicator "Downloading repo jq..."
    log "\n"

    download_deb mosquitto &>>$err_log &
    bussy_indicator "Downloading repo mosquitto..."
    log "\n"

    download_deb software-properties-common &>>$err_log &
    bussy_indicator "Downloading repo software-properties-common..."
    log "\n"

    download_deb glusterfs-server &>>$err_log &
    bussy_indicator "Downloading repo glusterfs-server..."
    log "\n"

    download_deb glusterfs-client &>>$err_log &
    bussy_indicator "Downloading repo glusterfs-client..."
    log "\n"

    download_deb gitlab-runner &>>$err_log &
    bussy_indicator "Downloading repo gitlab-runner..."
    log "\n"


    ########## Download docker images

    cd $_CPWD
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
            fetch_docker_images $D_IMG $D_VER $F_NAME &>>$err_log &
            bussy_indicator "Downloading docker image $D_IMG..."
            log "\n"
        fi
    done

    BASE_FOLDER="$(dirname "$_DIR")"
    BASE_FOLDER="$(dirname "$BASE_FOLDER")"
    BASE_FOLDER="$(dirname "$BASE_FOLDER")"

    # Build & export multipaas docker images
    cd $BASE_FOLDER/src/api
    rm -rf node_modules
    rm -rf package-lock.json
    docker build -t multipaas-api:0.9 .
    if [ $? -ne 0 ]; then
        echo "Error building MultiPaaS API docker image"
        exit 1
    fi
    docker save -o $BASE_FOLDER/install/build/offline_files/docker-images/multipaas-api-0.9.tar multipaas-api:0.9
    docker rmi multipaas-api:0.9
    docker images purge

    cd $BASE_FOLDER/src/task-controller
    rm -rf node_modules
    rm -rf package-lock.json
    docker build -t multipaas-ctrl:0.9 .
    if [ $? -ne 0 ]; then
        echo "Error building MultiPaaS Ctrl docker image"
        exit 1
    fi
    docker save -o $BASE_FOLDER/install/build/offline_files/docker-images/multipaas-ctrl-0.9.tar multipaas-ctrl:0.9
    docker rmi multipaas-ctrl:0.9
    docker images purge
}

########################################
# LOGIC...
########################################
/usr/bin/clear

base64 -d <<<"ICAgXyAgICBfICAgICAgIF8gX19fX18gICAgICAgICAgICAgX19fX18gICBfX19fXyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICB8IHwgIHwgfCAgICAgKF8pICBfXyBcICAgICAgICAgICAvIF9fX198IHwgIF9fIFwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICB8IHwgIHwgfF8gX18gIF98IHxfXykgfF8gXyAgX18gX3wgKF9fXyAgIHwgfF9fKSB8IF9fIF9fXyBfIF9fICAgX18gXyBfIF9fIF9fXyAKICB8IHwgIHwgfCAnXyBcfCB8ICBfX18vIF9gIHwvIF9gIHxcX19fIFwgIHwgIF9fXy8gJ19fLyBfIFwgJ18gXCAvIF9gIHwgJ19fLyBfIFwKICB8IHxfX3wgfCB8IHwgfCB8IHwgIHwgKF98IHwgKF98IHxfX19fKSB8IHwgfCAgIHwgfCB8ICBfXy8gfF8pIHwgKF98IHwgfCB8ICBfXy8KICAgXF9fX18vfF98IHxffF98X3wgICBcX18sX3xcX18sX3xfX19fXy8gIHxffCAgIHxffCAgXF9fX3wgLl9fLyBcX18sX3xffCAgXF9fX3wKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHwgfCAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHxffCAgICAgICAgICAgICAgICAgICA="
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

log "\n"
success "Build process done! You can now proceed to the installation of the control-plane as well as the host-node.\n"

# Go back to initial folder
cd "$_PWD"