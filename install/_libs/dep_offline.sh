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
pem_offline_install() {
    echo "==========> $(pwd)"
    if [ ! -d "../build/ubuntu_bionic/debs/$1" ] && [ ! -d "../../build/ubuntu_bionic/debs/$1" ]; then
        error "The local lib files for dependecy $1 have not been found.\n"
        error "Please run the preparation script first before continuing.\n"
        exit 1
    fi
    if [ -d "../build/ubuntu_bionic/debs/$1" ]; then
        sudo dpkg -i ../build/ubuntu_bionic/debs/$1/*.deb
    else
        sudo dpkg -i ../../build/ubuntu_bionic/debs/$1/*.deb
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
                pem_offline_install "wget"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "wget"
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
                pem_offline_install "curl"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "curl"
            fi
        fi
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
                pem_offline_install "make"
                pem_offline_install "perl"
                pem_offline_install "gcc"
                sudo dpkg -i ../build/ubuntu_bionic/debs/virtualbox-6.1/libpython2.7-minimal_*.deb
                sudo dpkg -i ../build/ubuntu_bionic/debs/virtualbox-6.1/python2.7-minimal_*.deb
                sudo dpkg -i ../build/ubuntu_bionic/debs/virtualbox-6.1/python-minimal_*.deb
                pem_offline_install "virtualbox-6.1" && sudo usermod -aG vboxusers $USER
            fi
        fi
        if [ "$DISTRO" == "redhat" ]; then
            error "Virtualbox is required, but it is not installed.\n" 
            warn "Please install Virtualbox manually first, then run this script again.\n"
            exit 1
        fi
    fi
    VAGRANT_EXISTS=$(command -v vagrant)
    if [ "$VAGRANT_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                pem_offline_install "vagrant"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "vagrant"
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
                pem_offline_install "containerd"
                pem_offline_install "docker-ce-cli"
                pem_offline_install "docker-ce" && sudo usermod -aG docker $USER
            fi
        elif [ "$DISTRO" == "redhat" ]; then
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
dep_jq() {
    cd $_DIR
    JQ_EXISTS=$(command -v jq)
    if [ "$JQ_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                pem_offline_install "jq"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "jq"
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
                pem_offline_install "tar"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "tar"
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
                pem_offline_install "sshpass"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "8" ]; then
                rpm_offline_install "sshpass"
            fi
        fi
    fi
}

########################################
# 
########################################
dep_nodejs() {
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
                pem_offline_install "nodejs"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
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
dep_pm2() {
    cd $_DIR
    PM2_EXISTS=$(command -v pm2)
    if [ "$PM2_EXISTS" == "" ]; then
        # PM2_INSTALL_DIR=/usr/lib/node_modules
        PM2_INSTALL_DIR=/opt
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                sudo tar xpf ../build/ubuntu_bionic/npm-modules/pm2-4.4.0.tgz -C $PM2_INSTALL_DIR
            fi
        elif [ "$DISTRO" == "redhat" ]; then
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