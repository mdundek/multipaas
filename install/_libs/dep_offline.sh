#!/bin/bash

########################################
# 
########################################
rpm_offline_install() {
    if [ ! -d "../build/centos8/rpms/$1" ] && [ ! -d "../../build/centos8/rpms/$1" ]; then
        error "The local lib files for dependecy $1 have not been found.\n"
        error "Please run the preparation script first before continuing.\n"
        exit 1
    fi
    if [ ! -d "../build/centos8/rpms/$1" ]; then
        sudo yum install -y --cacheonly --disablerepo=* ../build/centos8/rpms/$1/*.rpm
    else
        sudo yum install -y --cacheonly --disablerepo=* ../../build/centos8/rpms/$1/*.rpm
    fi
}

########################################
# 
########################################
deb_offline_install() {
    if [ ! -d "../build/ubuntu_bionic/debs/$1" ] && [ ! -d "../../build/offline_files/debs/$1" ]; then
        error "The local lib files for dependecy $1 have not been found.\n"
        error "Please run the preparation script first before continuing.\n"
        exit 1
    fi
    if [ -d "../build/ubuntu_bionic/debs/$1" ]; then
        sudo dpkg -i ../build/ubuntu_bionic/debs/$1/*.deb
    else
        sudo dpkg -i ../../build/offline_files/debs/$1/*.deb
    fi
}









########################################
# 
########################################
dep_wget() {
    cd $_DIR
    WGET_EXISTS=$(command -v wget)
    if [ "$WGET_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                deb_offline_install "wget"
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "wget"
            fi
        fi
    fi
}

########################################
# 
########################################
dep_node() {
    cd $_DIR
    NODE_EXISTS=$(command -v node)
    INSTALL_NODE=0
    if [ "$NODE_EXISTS" == "" ]; then
        INSTALL_NODE=1
    else
        NV=$(node --version | cut -d'.' -f1)
        if [ "${NV//v}" -lt "12" ]; then
            INSTALL_NODE=1
        fi 
    fi
    if [ $INSTALL_NODE = 1 ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                sudo mkdir -p /opt/nodejs
                sudo chmod -R 755 /opt/nodejs
                sudo cp ../../build/offline_files/debs/nodejs/node-v12.18.0-linux-x64.tar.xz /opt
                cd /opt
                sudo tar xf /opt/node-v12.18.0-linux-x64.tar.xz --directory /opt/nodejs
                sudo rm -rf /opt/node-v12.18.0-linux-x64.tar.xz
                sudo mv /opt/nodejs/node-v12.18.0-linux-x64/* /opt/nodejs
                sudo rm -rf /opt/nodejs/node-v12.18.0-linux-x64
                echo 'export NODEJS_HOME=/opt/nodejs/bin' >> ~/.profile
                echo 'export PATH=$NODEJS_HOME:$PATH' >> ~/.profile
                echo 'export NODEJS_HOME=/opt/nodejs/bin' >> ~/.bashrc
                echo 'export PATH=$NODEJS_HOME:$PATH' >> ~/.bashrc
                source ~/.profile
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                if [ "$(command -v python2)" == "" ]; then
                    rpm_offline_install "python2"
                fi
                rpm_offline_install "nodejs"
            fi
        fi
    fi
}

########################################
# 
########################################
dep_docker() {
    cd $_DIR
    DOCKER_EXISTS=$(command -v docker)
    if [ "$DOCKER_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                deb_offline_install "containerd"
                deb_offline_install "docker-ce-cli"
                deb_offline_install "docker-ce" && sudo usermod -aG docker $USER
                sudo systemctl start docker
                sudo systemctl enable docker
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "container-selinux"
                rpm_offline_install "containerd.io"
                rpm_offline_install "docker-ce" && sudo usermod -aG docker $USER
            fi
        fi
        NEW_DOCKER="true"
    fi
}

########################################
# 
########################################
dep_vbox() {
    cd $_DIR
    VIRTUALBOX_EXISTS=$(command -v vboxmanage)
    if [ "$VIRTUALBOX_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                deb_offline_install "make"
                deb_offline_install "perl"
                deb_offline_install "gcc"
                sudo dpkg -i ../build/ubuntu_bionic/debs/virtualbox-6.1/libpython2.7-minimal_*.deb
                sudo dpkg -i ../build/ubuntu_bionic/debs/virtualbox-6.1/python2.7-minimal_*.deb
                sudo dpkg -i ../build/ubuntu_bionic/debs/virtualbox-6.1/python-minimal_*.deb
                deb_offline_install "virtualbox-6.1" && sudo usermod -aG vboxusers $USER
            fi
        fi
        if [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            error "Virtualbox is required, but it is not installed.\n" 
            warn "Please install Virtualbox manually first, then run this script again.\n"
            exit 1
        fi
    fi
    VAGRANT_EXISTS=$(command -v vagrant)
    if [ "$VAGRANT_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                deb_offline_install "vagrant"
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "vagrant"
            fi
        fi
    fi
}


########################################
# 
########################################
dep_curl() {
    cd $_DIR
    CURL_EXISTS=$(command -v curl)
    if [ "$CURL_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                deb_offline_install "curl"
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "curl"
            fi
        fi
    fi
}

########################################
# 
########################################
dep_kubernetes() {
    cd $_DIR
    K8S_EXISTS=$(command -v kubeadm)
    if [ "$K8S_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                deb_offline_install "kubeadm"
                deb_offline_install "kubectl"
                deb_offline_install "kubelet"
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "kubeadm"
                rpm_offline_install "kubectl"
                rpm_offline_install "kubelet"
            fi
        fi
    fi
}

########################################
# 
########################################
dep_jq() {
    cd $_DIR
    JQ_EXISTS=$(command -v jq)
    if [ "$JQ_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                deb_offline_install "libonig4"
                deb_offline_install "jq"
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "jq"
            fi
        fi
    fi
}

########################################
# 
########################################
dep_gitlab_runner() {
    cd $_DIR
    local C_EXISTS=$(command -v gitlab-runner)
    if [ "$C_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                deb_offline_install "gitlab-runner"
                sudo usermod -aG docker gitlab-runner
                DKR_EXISTS=$(command -v docker)
                if [ "$DKR_EXISTS" == "" ]; then
                    sudo service docker restart
                fi
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "gitlab-runner"
            fi
        fi
    fi
}

########################################
# 
########################################
dep_gluster_client() {
    cd $_DIR
    local C_EXISTS=$(command -v gluster)
    if [ "$C_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                # deb_offline_install "glibc-doc-reference"
                # deb_offline_install "libc6-dev"
                # deb_offline_install "libnl-3-200"
                deb_offline_install "glusterfs-client"
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "glusterfs-server"
            fi
        fi
    fi
}

########################################
# 
########################################
dep_mosquitto() {
    cd $_DIR
    local C_EXISTS=$(command -v mosquitto_pub)
    if [ "$C_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                deb_offline_install "libc-ares2"
                deb_offline_install "mosquitto-clients"
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "mosquitto-clients"
            fi
        fi
    fi
}

########################################
# 
########################################
dep_tar() {
    cd $_DIR
    TAR_EXISTS=$(command -v tar)
    if [ "$TAR_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                deb_offline_install "tar"
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "tar"
            fi
        fi
    fi
}

########################################
# 
########################################
dep_unzip() {
    cd $_DIR
    UNZIP_EXISTS=$(command -v unzip)
    if [ "$UNZIP_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                deb_offline_install "unzip"
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "unzip"
            fi
        fi
    fi
}

########################################
# 
########################################
dep_sshpass() {
    cd $_DIR
    SSHPASS_EXISTS=$(command -v sshpass)
    if [ "$SSHPASS_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                deb_offline_install "sshpass"
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "sshpass"
            fi
        fi
    fi
}

########################################
# 
########################################
dep_pm2() {
    cd $_DIR
    PM2_EXISTS=$(command -v pm2)
    if [ "$PM2_EXISTS" == "" ]; then
        # PM2_INSTALL_DIR=/usr/lib/node_modules
        PM2_INSTALL_DIR=/opt
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                if [ -d "$PM2_INSTALL_DIR/pm2" ]; then
                    sudo rm -rf $PM2_INSTALL_DIR/pm2
                fi
                if [ -d "$PM2_INSTALL_DIR/package" ]; then
                    sudo rm -rf $PM2_INSTALL_DIR/package
                fi
                if [ -d "../build" ]; then
                    sudo tar xpf ../build/ubuntu_bionic/npm-modules/pm2-4.4.0.tgz -C $PM2_INSTALL_DIR
                elif [ -d "../../build/offline_files/npm-modules" ]; then
                    sudo tar xpf ../../build/offline_files/npm-modules/pm2-4.4.0.tgz -C $PM2_INSTALL_DIR
                else
                    echo "PM2 binary has not been found"
                    exit 1
                fi
                if [ -d "$PM2_INSTALL_DIR/package" ]; then
                    sudo mv $PM2_INSTALL_DIR/package $PM2_INSTALL_DIR/pm2
                fi
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                sudo tar xpf ../build/centos8/npm-modules/pm2-4.4.0.tgz -C $PM2_INSTALL_DIR
            fi
        fi
        if [ -d "$PM2_INSTALL_DIR/package" ]; then
            sudo mv $PM2_INSTALL_DIR/package $PM2_INSTALL_DIR/pm2
        fi
        sudo bash -c 'cat <<EOF > "/etc/profile.d/node.sh"
#!/bin/sh
export PATH="'$PM2_INSTALL_DIR'/pm2/bin:\$PATH"
EOF'
        . /etc/profile.d/node.sh
    fi
}

########################################
# 
########################################
dep_helm() {
    cd $_DIR
    HELM_EXISTS=$(command -v helm)
    if [ "$HELM_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                if [ -d "../build" ]; then
                    sudo tar xvf ../build/ubuntu_bionic/debs/helm/helm-v3.2.3-linux-amd64.tar.gz -C ../build/ubuntu_bionic/debs/helm
                    sudo mv ../build/ubuntu_bionic/debs/helm/linux-amd64/helm /usr/local/bin/
                elif [ -d "../../build/offline_files/debs" ]; then
                    sudo tar xvf ../../build/offline_files/debs/helm/helm-v3.2.3-linux-amd64.tar.gz -C ../../build/offline_files/debs/helm
                    sudo mv ../../build/offline_files/debs/helm/linux-amd64/helm /usr/local/bin/
                else
                    echo "HELM binary has not been found"
                    exit 1
                fi
            fi
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                echo "HELM binary for redhat not implemented"
                exit 1
            fi
        fi
    fi
}
