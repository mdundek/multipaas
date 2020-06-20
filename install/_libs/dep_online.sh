#!/bin/bash

########################################
# 
########################################
dep_wget() {
    WGET_EXISTS=$(command -v wget)
    if [ "$WGET_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
           sudo apt-get install -y wget
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                sudo yum -y install wget
            fi
        fi
    fi
}

########################################
# 
########################################
dep_node() {
    local C_EXISTS=$(command -v node)
    if [ "$C_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            curl -sL https://deb.nodesource.com/setup_12.x -o nodesource_setup.sh
            sudo bash nodesource_setup.sh
            sudo apt install -y nodejs
            sudo rm -rf nodesource_setup.sh
        elif [ "$DISTRO" == "redhat" ] && [ "$MAJ_V" == "7" ]; then
            sudo curl -sL https://rpm.nodesource.com/setup_12.x | sudo bash -
            sudo yum install -y nodejs
        fi
    fi
}

########################################
# 
########################################
dep_npm_bundle() {
    local C_EXISTS=$(command -v npm-bundle)
    if [ "$C_EXISTS" == "" ]; then
        sudo npm install npm-bundle -g
    fi
}

########################################
# 
########################################
dep_docker() {
    local C_EXISTS=$(command -v docker)
    if [ "$C_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            sudo apt install -y docker.io && sudo usermod -aG docker $USER
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            sudo yum install -y docker device-mapper-libs device-mapper-event-libs
            sudo systemctl enable --now docker.service
            sudo groupadd docker
            sudo usermod -aG docker ${USER}
            sudo chmod 666 /var/run/docker.sock
        fi
        NEW_DOCKER="true"
    fi
}

########################################
# 
########################################
dep_vbox() {
    VIRTUALBOX_EXISTS=$(command -v vboxmanage)
    if [ "$VIRTUALBOX_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            wget -q https://www.virtualbox.org/download/oracle_vbox_2016.asc -O- | sudo apt-key add -
            sudo add-apt-repository "deb [arch=amd64] http://download.virtualbox.org/virtualbox/debian $(lsb_release -cs) contrib"
            sudo apt update -y
            sudo apt install -y virtualbox-6.1 && sudo usermod -aG vboxusers $USER
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                wget -q https://download.virtualbox.org/virtualbox/rpm/el/virtualbox.repo
                sudo mv virtualbox.repo /etc/yum.repos.d/
                wget -q https://www.virtualbox.org/download/oracle_vbox.asc
                sudo rpm --import oracle_vbox.asc

                sudo yum -y update || echo "Updated Oracle licence"

                sudo dnf -y install https://dl.fedoraproject.org/pub/epel/epel-release-latest-8.noarch.rpm
                sudo yum install -y kernel-devel kernel-headers binutils libgomp make patch gcc glibc-headers glibc-devel dkms

                YUM_UTILS_EXIST=$(command -v yumdownloader)
                if [ "$YUM_UTILS_EXIST" == "" ]; then
                    sudo yum install -y yum-utils
                fi
                mkdir -p ./vbinstall
                sudo yumdownloader --assumeyes --destdir=./vbinstall --resolve VirtualBox-6.1
                sudo yum install -y --cacheonly --disablerepo=* ./vbinstall/*.rpm
                rm -rf ./vbinstall
                sudo usermod -aG vboxusers $USER
            fi
        fi
    fi

    VAGRANT_EXISTS=$(command -v vagrant)
    if [ "$VAGRANT_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            sudo bash -c 'echo deb https://vagrant-deb.linestarve.com/ any main > /etc/apt/sources.list.d/wolfgang42-vagrant.list'
            sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-key AD319E0F7CFFA38B4D9F6E55CE3F3DE92099F7A4 D2BABDFD63EA9ECAB4E09C7228A873EA3C7C705F
            sudo apt-get update -y
            sudo apt -y install vagrant
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            if [ "$MAJ_V" == "8" ]; then
                sudo dnf -y install https://releases.hashicorp.com/vagrant/2.2.7/vagrant_2.2.7_x86_64.rpm
            fi
        fi
    fi

    VAGRANT_VGA_PLUGIN_EXISTS=$(vagrant plugin list | grep "vagrant-vbguest")
    if [ "$VAGRANT_VGA_PLUGIN_EXISTS" == "" ]; then
        vagrant plugin install vagrant-vbguest
    fi

    VAGRANT_DSIZE_PLUGIN_EXISTS=$(vagrant plugin list | grep "vagrant-disksize")
    if [ "$VAGRANT_DSIZE_PLUGIN_EXISTS" == "" ]; then
        vagrant plugin install vagrant-disksize
    fi
}




# ########################################
# # 
# ########################################
# dep_curl() {
#     cd $_DIR
#     CURL_EXISTS=$(command -v curl)
#     if [ "$CURL_EXISTS" == "" ]; then
#         if [ "$DISTRO" == "ubuntu" ]; then
#             if [ "$MAJ_V" == "18.04" ]; then
#                 deb_offline_install "curl"
#             fi
#         elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
#             if [ "$MAJ_V" == "8" ]; then
#                 rpm_offline_install "curl"
#             fi
#         fi
#     fi
# }

# ########################################
# # 
# ########################################
# dep_kubernetes() {
#     cd $_DIR
#     K8S_EXISTS=$(command -v kubeadm)
#     if [ "$K8S_EXISTS" == "" ]; then
#         if [ "$DISTRO" == "ubuntu" ]; then
#             if [ "$MAJ_V" == "18.04" ]; then
#                 deb_offline_install "kubeadm"
#                 deb_offline_install "kubectl"
#                 deb_offline_install "kubelet"
#             fi
#         elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
#             if [ "$MAJ_V" == "8" ]; then
#                 rpm_offline_install "kubeadm"
#                 rpm_offline_install "kubectl"
#                 rpm_offline_install "kubelet"
#             fi
#         fi
#     fi
# }

# ########################################
# # 
# ########################################
# dep_jq() {
#     cd $_DIR
#     JQ_EXISTS=$(command -v jq)
#     if [ "$JQ_EXISTS" == "" ]; then
#         if [ "$DISTRO" == "ubuntu" ]; then
#             if [ "$MAJ_V" == "18.04" ]; then
#                 deb_offline_install "libonig4"
#                 deb_offline_install "jq"
#             fi
#         elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
#             if [ "$MAJ_V" == "8" ]; then
#                 rpm_offline_install "jq"
#             fi
#         fi
#     fi
# }

# ########################################
# # 
# ########################################
# dep_gitlab_runner() {
#     cd $_DIR
#     local C_EXISTS=$(command -v gitlab-runner)
#     if [ "$C_EXISTS" == "" ]; then
#         if [ "$DISTRO" == "ubuntu" ]; then
#             if [ "$MAJ_V" == "18.04" ]; then
#                 deb_offline_install "gitlab-runner"
#             fi
#         elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
#             if [ "$MAJ_V" == "8" ]; then
#                 rpm_offline_install "gitlab-runner"
#             fi
#         fi
#     fi
# }

# ########################################
# # 
# ########################################
# dep_gluster_server() {
#     cd $_DIR
#     local C_EXISTS=$(command -v gluster)
#     if [ "$C_EXISTS" == "" ]; then
#         if [ "$DISTRO" == "ubuntu" ]; then
#             if [ "$MAJ_V" == "18.04" ]; then
#                 deb_offline_install "glibc-doc-reference"
#                 deb_offline_install "libc6-dev"
#                 deb_offline_install "libnl-3-200"
#                 deb_offline_install "glusterfs-server"
#             fi
#         elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
#             if [ "$MAJ_V" == "8" ]; then
#                 rpm_offline_install "glusterfs-server"
#             fi
#         fi
#     fi
# }

# ########################################
# # 
# ########################################
# dep_mosquitto() {
#     cd $_DIR
#     local C_EXISTS=$(command -v mosquitto_pub)
#     if [ "$C_EXISTS" == "" ]; then
#         if [ "$DISTRO" == "ubuntu" ]; then
#             if [ "$MAJ_V" == "18.04" ]; then
#                 deb_offline_install "mosquitto-clients"
#             fi
#         elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
#             if [ "$MAJ_V" == "8" ]; then
#                 rpm_offline_install "mosquitto-clients"
#             fi
#         fi
#     fi
# }

# ########################################
# # 
# ########################################
# dep_tar() {
#     cd $_DIR
#     TAR_EXISTS=$(command -v tar)
#     if [ "$TAR_EXISTS" == "" ]; then
#         if [ "$DISTRO" == "ubuntu" ]; then
#             if [ "$MAJ_V" == "18.04" ]; then
#                 deb_offline_install "tar"
#             fi
#         elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
#             if [ "$MAJ_V" == "8" ]; then
#                 rpm_offline_install "tar"
#             fi
#         fi
#     fi
# }

# ########################################
# # 
# ########################################
# dep_unzip() {
#     cd $_DIR
#     UNZIP_EXISTS=$(command -v unzip)
#     if [ "$UNZIP_EXISTS" == "" ]; then
#         if [ "$DISTRO" == "ubuntu" ]; then
#             if [ "$MAJ_V" == "18.04" ]; then
#                 deb_offline_install "unzip"
#             fi
#         elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
#             if [ "$MAJ_V" == "8" ]; then
#                 rpm_offline_install "unzip"
#             fi
#         fi
#     fi
# }

# ########################################
# # 
# ########################################
# dep_sshpass() {
#     cd $_DIR
#     SSHPASS_EXISTS=$(command -v sshpass)
#     if [ "$SSHPASS_EXISTS" == "" ]; then
#         if [ "$DISTRO" == "ubuntu" ]; then
#             if [ "$MAJ_V" == "18.04" ]; then
#                 deb_offline_install "sshpass"
#             fi
#         elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
#             if [ "$MAJ_V" == "8" ]; then
#                 rpm_offline_install "sshpass"
#             fi
#         fi
#     fi
# }



# ########################################
# # 
# ########################################
# dep_pm2() {
#     cd $_DIR
#     PM2_EXISTS=$(command -v pm2)
#     if [ "$PM2_EXISTS" == "" ]; then
#         # PM2_INSTALL_DIR=/usr/lib/node_modules
#         PM2_INSTALL_DIR=/opt
#         if [ "$DISTRO" == "ubuntu" ]; then
#             if [ "$MAJ_V" == "18.04" ]; then
#                 sudo tar xpf ../build/ubuntu_bionic/npm-modules/pm2-4.4.0.tgz -C $PM2_INSTALL_DIR
#             fi
#         elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
#             if [ "$MAJ_V" == "8" ]; then
#                 sudo tar xpf ../build/centos8/npm-modules/pm2-4.4.0.tgz -C $PM2_INSTALL_DIR
#             fi
#         fi
#         if [ -d "$PM2_INSTALL_DIR/package" ]; then
#             sudo mv $PM2_INSTALL_DIR/package $PM2_INSTALL_DIR/pm2
#         fi
#         sudo bash -c 'cat <<EOF > "/etc/profile.d/node.sh"
# #!/bin/sh
# export PATH="'$PM2_INSTALL_DIR'/pm2/bin:\$PATH"
# EOF'
#         . /etc/profile.d/node.sh
#     fi
# }