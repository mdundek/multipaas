#!/bin/bash

####################### Position to script folder
_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"
cd $_DIR

BASE_FOLDER="$(dirname "$_DIR")"
BASE_FOLDER="$(dirname "$BASE_FOLDER")"
BASE_FOLDER="$(dirname "$BASE_FOLDER")"

err_log=$_DIR/std.log

. ../../_libs/common.sh
. ../../_libs/distro.sh
. ../../_libs/dep_online.sh
. ../../_libs/update.sh

########################################
# CHECK DEPS FILES
########################################
dependency_dl_exists_deb_ubuntu_bionic() {
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
# CHECK RPMS FILES
########################################
dependency_dl_exists_rpm() {
    local _EXISTS=""
    
    if [ -d "$1" ]; then
        if [ -n "$(ls $1)" ]; then 
            _EXISTS="OK"
        fi
    fi
    echo $_EXISTS
}

########################################
# DOWNLOAD DEPS
########################################
download_deb_ubuntu_bionic() {
    if [ -z "$(dependency_dl_exists_deb_ubuntu_bionic $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/$1)" ]; then
        mkdir -p $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/$1
        echo "==> Downloading package $1"
        cd $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/$1
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
# DOWNLOAD RPMS
########################################
download_rpm_redhat_7() {
    if [ -z "$(dependency_dl_exists_rpm $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/$1)" ]; then
        mkdir -p $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/$1
        echo "==> Downloading package $1"
        cd $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/$1

        for i in $(repoquery --requires --resolve $1); do
            yumdownloader --assumeyes --destdir=./ --resolve $i
        done
        yumdownloader --assumeyes --destdir=./ --resolve $1
        rm -rf $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/$1/*.i686.rpm 
    else
        echo "==> $1 already present, skipping download"
    fi
}

########################################
# DOWNLOAD RPMS
########################################
download_rpm_centos_8() {
    if [ -z "$(dependency_dl_exists_rpm $OFFLINE_FOLDER/rpms/centos_eight/$PK_FOLDER_NAME/$1)" ]; then
        mkdir -p $OFFLINE_FOLDER/rpms/centos_eight/$PK_FOLDER_NAME/$1
        echo "==> Downloading package $1"
        cd $OFFLINE_FOLDER/rpms/centos_eight/$PK_FOLDER_NAME/$1

        for i in $(repoquery --requires --resolve $1); do
            yumdownloader --assumeyes --destdir=./ --resolve $i
        done
        yumdownloader --assumeyes --destdir=./ --resolve $1
        rm -rf $OFFLINE_FOLDER/rpms/centos_eight/$PK_FOLDER_NAME/$1/*.i686.rpm 
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
dependencies_redhat_8 () {
    sudo yum install -y yum-utils
    sudo yum install -y epel-release
    sudo modprobe fuse    
}

########################################
# RESOLVE DEPEENDENCIES
########################################
dependencies_redhat_7 () {
    sudo yum install -y yum-utils
    sudo yum install -y epel-release
    sudo modprobe fuse    
}

dependencies_offline_mode () {
    sudo echo "" # Ask user for sudo password now

    DK_EXISTS=$(command -v docker)
    dep_docker &>>$err_log &
    bussy_indicator "Dependency on \"docker\"..."
    log "\n"

    if [ "$DK_EXISTS" == "" ]; then
        if [ "$DISTRO" == "redhat" ]; then
            sudo firewall-cmd --permanent --zone=trusted  --add-interface=docker0 &>>$err_log
            sudo firewall-cmd --reload &>>$err_log
        fi
        log "\n"
        warn "==> Docker was just installed, you will have to restart your session before starting the cluster-ctl container. Please log out, and log back in, then execute this script again.\n"
        exit 1
    fi

    # Make sure we have access to docher deamon
    DOCKER_USER_OK=$(groups | grep "docker")
    if [ "$DOCKER_USER_OK" == "" ]; then
        error "The current user does not have access to the docker deamon.\n"
        error "Did you restart your session afterhaving installed docker?\n"
        exit 1
    fi

    dep_wget &>>$err_log &
    bussy_indicator "Dependency on \"wget\"..."
    log "\n"

    if [ "$DISTRO" == "redhat" ] && [ "$MAJ_V" == "7" ]; then
        dependencies_redhat_7 &>>$err_log &
        bussy_indicator "Dependency on \"redhat\"..."
        log "\n"
    fi

    dep_node &>>$err_log &
    bussy_indicator "Dependency on \"node\"..."
    log "\n"

    dep_npm_bundle &>>$err_log &
    bussy_indicator "Dependency on \"npm_bundle\"..."
    log "\n"
}

build_multipaas_api() {
    cd $BASE_FOLDER/src/api
    rm -rf node_modules
    rm -rf package-lock.json
    docker build -t multipaas-api:0.9 .
    if [ $? -ne 0 ]; then
        echo "Error building MultiPaaS API docker image"
        exit 1
    fi
    docker save -o $BASE_FOLDER/install/build/offline_files/docker_images/multipaas-api-0.9.tar multipaas-api:0.9
    docker rmi multipaas-api:0.9
    docker images purge
}

build_multipaas_ctrl() {
    cd $BASE_FOLDER/src/task-controller
    rm -rf node_modules
    rm -rf package-lock.json
    docker build -t multipaas-ctrl:0.9 .
    if [ $? -ne 0 ]; then
        echo "Error building MultiPaaS Ctrl docker image"
        exit 1
    fi
    docker save -o $BASE_FOLDER/install/build/offline_files/docker_images/multipaas-ctrl-0.9.tar multipaas-ctrl:0.9
    docker rmi multipaas-ctrl:0.9
    docker images purge
}


########################################
# BUILD FOR TARGET UBUNTU
########################################
build_for_ubuntu_bionic() {
    cd $_DIR
    sudo chown _apt /var/lib/update-notifier/package-data-downloads/partial/

    ########## Download binaries

    # DOCKER
    if [ -z "$(dependency_dl_exists_deb_ubuntu_bionic $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/containerd)" ]; then
        mkdir -p $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/containerd
        wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/containerd.io_1.2.6-3_amd64.deb -O $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/containerd/containerd.io_1.2.6-3_amd64.deb &>>$err_log &
        bussy_indicator "Adding repo Containerd..."
        log "\n"
    fi

    if [ -z "$(dependency_dl_exists_deb_ubuntu_bionic $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/docker-ce-cli)" ]; then
        mkdir -p $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/docker-ce-cli
        wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/docker-ce-cli_19.03.9~3-0~ubuntu-bionic_amd64.deb -O $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/docker-ce-cli/docker-ce-cli_19.03.9~3-0~ubuntu-bionic_amd64.deb &>>$err_log &
        bussy_indicator "Adding repo docker-ce-cli..."
        log "\n"
    fi

    if [ -z "$(dependency_dl_exists_deb_ubuntu_bionic $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/docker-ce)" ]; then
        mkdir -p $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/docker-ce
        wget https://download.docker.com/linux/ubuntu/dists/bionic/pool/stable/amd64/docker-ce_19.03.9~3-0~ubuntu-bionic_amd64.deb -O $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/docker-ce/docker-ce_19.03.9~3-0~ubuntu-bionic_amd64.deb &>>$err_log &
        bussy_indicator "Adding repo docker-ce..."
        log "\n"
    fi
    
    # GITLAB-RUNNER
    if [ -z "$(dependency_dl_exists_deb_ubuntu_bionic $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/gitlab-runner)" ]; then
        curl -s -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash &>>$err_log &
        bussy_indicator "Adding repo gitlab-runner..."
        log "\n"
    fi

    # KUBERNETES
    if [ -z "$(dependency_dl_exists_deb_ubuntu_bionic $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/kubeadm)" ]; then
        curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add &>>$err_log &
        bussy_indicator "Adding repo key K8S..."
        log "\n"
        sudo apt-add-repository "deb http://apt.kubernetes.io/ kubernetes-xenial main" &>>$err_log &
        bussy_indicator "Adding repo K8S..."
        log "\n"
    fi

    # Add Gluster repo
    if [ -z "$(dependency_dl_exists_deb_ubuntu_bionic $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/glusterfs-server)" ]; then
        sudo add-apt-repository -y ppa:gluster/glusterfs-5 &>>$err_log &
        bussy_indicator "Adding repo GlusterFS..."
        log "\n"
    fi

    # Nodejs
    if [ -z "$(dependency_dl_exists_deb_ubuntu_bionic $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/nodejs)" ]; then
        mkdir -p $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/nodejs
        wget https://nodejs.org/dist/v12.18.0/node-v12.18.0-linux-x64.tar.xz -O $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/nodejs/node-v12.18.0-linux-x64.tar.xz &>>$err_log &
        bussy_indicator "Downloading NodeJS 12..."
        log "\n"
    fi

    # Helm
    if [ -z "$(dependency_dl_exists_deb_ubuntu_bionic $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/helm)" ]; then
        mkdir -p $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/helm
        wget https://get.helm.sh/helm-v3.2.3-linux-amd64.tar.gz -O $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/helm/helm-v3.2.3-linux-amd64.tar.gz &>>$err_log &
        bussy_indicator "Downloading Helm..."
        log "\n"
    fi
    

    sudo apt update -y &>>$err_log &
    bussy_indicator "Updating repos..."
    log "\n"

    download_deb_ubuntu_bionic kubeadm &>>$err_log &
    bussy_indicator "Downloading repo kubeadm..."
    log "\n"

    download_deb_ubuntu_bionic kubelet &>>$err_log &
    bussy_indicator "Downloading repo kubelet..."
    log "\n"

    download_deb_ubuntu_bionic kubectl &>>$err_log &
    bussy_indicator "Downloading repo kubectl..."
    log "\n"

    dep_kubernetes &>>$err_log &
    bussy_indicator "Installing Kubernetes binaries..."
    log "\n"
    
    kubeadm config images pull &>>$err_log &
    bussy_indicator "Pulling K8S images..."
    log "\n"

    download_deb_ubuntu_bionic sshpass &>>$err_log &
    bussy_indicator "Downloading repo sshpass..."
    log "\n"

    download_deb_ubuntu_bionic unzip &>>$err_log &
    bussy_indicator "Downloading repo unzip..."
    log "\n"

    download_deb_ubuntu_bionic wget &>>$err_log &
    bussy_indicator "Downloading repo wget..."
    log "\n"

    download_deb_ubuntu_bionic curl &>>$err_log &
    bussy_indicator "Downloading repo curl..."
    log "\n"

    download_deb_ubuntu_bionic jq &>>$err_log &
    bussy_indicator "Downloading repo jq..."
    log "\n"

    download_deb_ubuntu_bionic mosquitto &>>$err_log &
    bussy_indicator "Downloading repo mosquitto..."
    log "\n"

    download_deb_ubuntu_bionic libc-ares2 &>>$err_log &
    bussy_indicator "Downloading repo libc-ares2..."
    log "\n"

    download_deb_ubuntu_bionic mosquitto-clients &>>$err_log &
    bussy_indicator "Downloading repo mosquitto-clients..."
    log "\n"

    download_deb_ubuntu_bionic software-properties-common &>>$err_log &
    bussy_indicator "Downloading repo software-properties-common..."
    log "\n"

    download_deb_ubuntu_bionic glusterfs-client &>>$err_log &
    bussy_indicator "Downloading repo glusterfs-client..."
    log "\n"

    download_deb_ubuntu_bionic glusterfs-server &>>$err_log &
    bussy_indicator "Downloading repo glusterfs-server..."
    log "\n"

    download_deb_ubuntu_bionic gitlab-runner &>>$err_log &
    bussy_indicator "Downloading repo gitlab-runner..."
    rm -rf $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME/gitlab-runner/docker-engine_*.deb
    log "\n"

    download_deb_ubuntu_bionic libc6-dev &>>$err_log &
    bussy_indicator "Downloading repo libc6-dev..."
    log "\n"

    download_deb_ubuntu_bionic libnl-3-200 &>>$err_log &
    bussy_indicator "Downloading repo libnl-3-200..."
    log "\n"

    download_deb_ubuntu_bionic libonig4 &>>$err_log &
    bussy_indicator "Downloading repo libonig4..."
    log "\n"

    download_deb_ubuntu_bionic glibc-doc-reference &>>$err_log &
    bussy_indicator "Downloading repo glibc-doc-reference..."
    log "\n"
}

downloading_nodejs_redhat_7() {
    if [ -z "$(dependency_dl_exists_rpm $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/nodejs)" ]; then
        mkdir -p $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/nodejs
        wget https://nodejs.org/dist/v12.18.0/node-v12.18.0-linux-x64.tar.xz -O $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/nodejs/node-v12.18.0-linux-x64.tar.xz &>>$err_log &
        bussy_indicator "Downloading NodeJS 12..."
        log "\n"
    fi
}

downloading_docker_redhat_7() {
    if [ -z "$(dependency_dl_exists_rpm $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/docker)" ]; then
        mkdir -p $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/docker
        cd $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/docker
        wget https://download.docker.com/linux/static/stable/x86_64/docker-19.03.9.tgz
    fi
}

downloading_gitlab_runner_redhat_7() {
    if [ -z "$(dependency_dl_exists_rpm $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/gitlab-runner)" ]; then
        mkdir -p $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/gitlab-runner
        cd $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/gitlab-runner
        wget -q https://gitlab-runner-downloads.s3.amazonaws.com/latest/rpm/gitlab-runner_amd64.rpm -O $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/gitlab-runner/gitlab-runner_amd64.rpm
    fi
}

downloading_kubernetes_redhat_7() {
    if [ -z "$(dependency_dl_exists_rpm $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/kubeadm)" ]; then
        download_rpm_redhat_7 kubeadm
        download_rpm_redhat_7 kubectl
        download_rpm_redhat_7 kubelet
        download_rpm_redhat_7 kubernetes-cni
    
        # Delete dupliucate libs with diff versions (keep newest)
        array=($(ls $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/kubelet/))
        for i in "${!array[@]}"; do
            PREV_I=$(($i-1))
            if [ "$PREV_I" != "-1" ]; then
                if [[ ${array[$i]} == conntrack-tools-* ]] && [[ ${array[$(($i-1))]} == conntrack-tools-* ]]; then
                    sudo rm -rf "$OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/kubelet/${array[$(($i-1))]}"
                elif [[ ${array[$i]} == socat-* ]] && [[ ${array[$(($i-1))]} == socat-* ]]; then
                    sudo rm -rf "$OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/kubelet/${array[$(($i-1))]}"
                fi
            fi
        done
        wget http://mirror.centos.org/centos/7/os/x86_64/Packages/libnetfilter_cttimeout-1.0.0-7.el7.x86_64.rpm -P $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/kubelet/
        wget http://mirror.centos.org/centos/7/os/x86_64/Packages/libnetfilter_queue-1.0.2-2.el7_2.x86_64.rpm -P $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/kubelet/
        wget http://mirror.centos.org/centos/7/os/x86_64/Packages/libnetfilter_cthelper-1.0.0-11.el7.x86_64.rpm -P $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/kubelet/
    fi
}

adding_repo_kubernetes_redhat_7() {
    if [ ! -f "/etc/yum.repos.d/kubernetes.repo" ]; then
        sudo tee -a /etc/yum.repos.d/kubernetes.repo >/dev/null <<'EOF'
[kubernetes]
name=Kubernetes
baseurl=https://packages.cloud.google.com/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
EOF
    fi
}

config_repos_redhat_7() {
    sudo subscription-manager repos --enable=rhel-7-server-rpms --enable=rhel-7-server-extras-rpms --enable=rhel-7-server-optional-rpms --enable=rhel-server-rhscl-7-rpms
}

build_for_redhat_7() {
    cd $_DIR
    
    adding_repo_kubernetes_redhat_7 &>>$err_log &
    bussy_indicator "Adding repo Kubernetes..."
    log "\n"

    sudo yum update -y &>>$err_log &
    bussy_indicator "Updating repos..."
    log "\n"

    dep_kubernetes &>>$err_log &
    bussy_indicator "Installing Kubernetes binaries..."
    log "\n"
    
    kubeadm config images pull &>>$err_log &
    bussy_indicator "Pulling K8S images..."
    log "\n"

    ########## Download binaries
    downloading_nodejs_redhat_7 &>>$err_log &
    bussy_indicator "Downloading NodeJS..."
    log "\n"

    downloading_docker_redhat_7 &>>$err_log &
    bussy_indicator "Downloading Docker..."
    log "\n"

    downloading_gitlab_runner_redhat_7 &>>$err_log &
    bussy_indicator "Downloading GitLab Runner..."
    log "\n"

    # Helm
    if [ -z "$(dependency_dl_exists_rpm $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/helm)" ]; then
        mkdir -p $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/helm
        wget https://get.helm.sh/helm-v3.2.3-linux-amd64.tar.gz -O $OFFLINE_FOLDER/rpms/redhat_seven/$PK_FOLDER_NAME/helm/helm-v3.2.3-linux-amd64.tar.gz &>>$err_log &
        bussy_indicator "Downloading Helm..."
        log "\n"
    fi
    
    downloading_kubernetes_redhat_7 &>>$err_log &
    bussy_indicator "Downloading kubernetes..."
    log "\n"

    download_rpm_redhat_7 unzip &>>$err_log &
    bussy_indicator "Downloading unzip..."
    log "\n"

    download_rpm_redhat_7 jq &>>$err_log &
    bussy_indicator "Downloading jq..."
    log "\n"

    download_rpm_redhat_7 mosquitto &>>$err_log &
    bussy_indicator "Downloading mosquitto..."
    log "\n"

    download_rpm_redhat_7 wget &>>$err_log &
    bussy_indicator "Downloading wget..."
    log "\n"

    download_rpm_redhat_7 curl &>>$err_log &
    bussy_indicator "Downloading curl..."
    log "\n"

    download_rpm_redhat_7 fuse &>>$err_log &
    bussy_indicator "Downloading fuse..."
    log "\n"

    download_rpm_redhat_7 fuse-libs &>>$err_log &
    bussy_indicator "Downloading fuse-libs..."
    log "\n"

    download_rpm_redhat_7 libibverbs &>>$err_log &
    bussy_indicator "Downloading libibverbs..."
    log "\n"

    sudo yum -y install openssh-server wget fuse fuse-libs libibverbs &>>$err_log

    download_rpm_redhat_7 glusterfs &>>$err_log &
    bussy_indicator "Downloading glusterfs..."
    log "\n"

    download_rpm_redhat_7 glusterfs-fuse &>>$err_log &
    bussy_indicator "Downloading glusterfs-fuse..."
    log "\n"
}

download_docker_images() {
    cd $_DIR

    sed -i.bak '/k8s.gcr.io/d' ../offline_files/docker_images/image-list.cfg
    docker images | grep "k8s.gcr.io" | awk -F" " '{ print $1,$2 }' | while read line; do
        UNAME=$(echo $line | awk '{split($0,a,"/"); print a[2]}' | awk '{ print $1 }')
        echo "$line $UNAME" >> ../offline_files/docker_images/image-list.cfg
    done

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
}

build_mp_docker_images() {
    # Build & export multipaas docker images
    build_multipaas_api &>>$err_log &
    bussy_indicator "Building multipaas api service..."
    log "\n"

    build_multipaas_ctrl &>>$err_log &
    bussy_indicator "Building multipaas controller service..."
    log "\n"
}

########################################
# LOGIC...
########################################
/usr/bin/clear

base64 -d <<<"ICAgXyAgICBfICAgICAgIF8gX19fX18gICAgICAgICAgICAgX19fX18gICBfX19fXyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICB8IHwgIHwgfCAgICAgKF8pICBfXyBcICAgICAgICAgICAvIF9fX198IHwgIF9fIFwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICB8IHwgIHwgfF8gX18gIF98IHxfXykgfF8gXyAgX18gX3wgKF9fXyAgIHwgfF9fKSB8IF9fIF9fXyBfIF9fICAgX18gXyBfIF9fIF9fXyAKICB8IHwgIHwgfCAnXyBcfCB8ICBfX18vIF9gIHwvIF9gIHxcX19fIFwgIHwgIF9fXy8gJ19fLyBfIFwgJ18gXCAvIF9gIHwgJ19fLyBfIFwKICB8IHxfX3wgfCB8IHwgfCB8IHwgIHwgKF98IHwgKF98IHxfX19fKSB8IHwgfCAgIHwgfCB8ICBfXy8gfF8pIHwgKF98IHwgfCB8ICBfXy8KICAgXF9fX18vfF98IHxffF98X3wgICBcX18sX3xcX18sX3xfX19fXy8gIHxffCAgIHxffCAgXF9fX3wgLl9fLyBcX18sX3xffCAgXF9fX3wKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHwgfCAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHxffCAgICAgICAgICAgICAgICAgICA="
log "\n\n"

# Determine current distro
distro

log "==> This script will download all required files to install MultiPaaS in single tenant mode for online/offline environements.\n"
log "\n"
yes_no "Do you wish to continue" CONTINUE_INSTALL
if [ "$CONTINUE_INSTALL" == "n" ]; then
    exit 0
fi

OFFLINE_FOLDER="$(dirname "$_DIR")/offline_files"

if [ "$DISTRO" == "ubuntu" ] && [ "$MAJ_V" == "18.04" ]; then
    PK_FOLDER_NAME="ubuntu_bionic"
    mkdir -p $OFFLINE_FOLDER/debs/$PK_FOLDER_NAME

    # Install dependencies
    dependencies_offline_mode
    log "\n"

    build_for_ubuntu_bionic
    log "\n"
else
    echo "Unsupported OS. This script only works on Ubuntu 18.04"
    exit 1
fi

########## Download docker images
download_docker_images

########## Build multipaas docker images
build_mp_docker_images

log "\n"
success "Build process done! You can now proceed to the installation of the control-plane as well as the host-node.\n"

# Go back to initial folder
cd "$_PWD"