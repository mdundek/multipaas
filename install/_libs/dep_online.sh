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
            sudo yum -y install wget
        fi
    fi
}

########################################
# 
########################################
dep_curl() {
    CURL_EXISTS=$(command -v curl)
    if [ "$CURL_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
           sudo apt-get install -y curl
        elif [ "$DISTRO" == "redhat" ]; then
            sudo yum -y install curl
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
dep_docker() {
    local C_EXISTS=$(command -v docker)
    if [ "$C_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            sudo apt install -y docker.io && sudo systemctl start docker && sudo systemctl enable docker && sudo usermod -aG docker $USER
        elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
            sudo yum install -y docker-ce && sudo usermod -aG docker ${USER} && sudo systemctl start docker && sudo systemctl enable docker
        fi
        NEW_DOCKER="true"
    fi
    id -u multipaas &>/dev/null
    if [ "$?" == "0" ]; then
        HAST_DK_GROUP=$(sudo su -c "groups" multipaas | grep "docker")
        if [ "$HAST_DK_GROUP" == "" ]; then
            sudo usermod -aG docker multipaas
        fi
    fi
}

########################################
# 
########################################
dep_kubernetes() {
    local K_EXISTS=$(command -v kubeadm)
    if [ "$K_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            sudo apt-get update -y && sudo apt-get install -y apt-transport-https curl
            curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add -
            cat <<EOF | sudo tee /etc/apt/sources.list.d/kubernetes.list
deb https://apt.kubernetes.io/ kubernetes-xenial main
EOF
            sudo apt-get update

            sudo apt install -y kubeadm
            sudo apt install -y kubectl
            sudo apt install -y kubelet
        elif [ "$DISTRO" == "redhat" ] && [ "$MAJ_V" == "7" ]; then
            sudo tee -a /etc/yum.repos.d/kubernetes.repo >/dev/null <<EOF
[kubernetes]
name=Kubernetes
baseurl=https://packages.cloud.google.com/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
exclude=kube*
EOF
            sudo setenforce 0
            sudo sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config
            sudo yum install -y kubelet kubeadm kubectl --disableexcludes=kubernetes
            sudo systemctl enable --now kubelet

            modprobe br_netfilter

            sudo tee -a /etc/sysctl.d/k8s.conf >/dev/null <<EOF
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
EOF
            sudo sysctl --system
        fi
    fi
}

########################################
# 
########################################
dep_jq() {
    JQ_EXISTS=$(command -v jq)
    if [ "$JQ_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
           sudo apt-get install -y jq
        elif [ "$DISTRO" == "redhat" ]; then
            sudo yum -y install jq
        fi
    fi
}

########################################
# 
########################################
dep_gitlab_runner() {
    C_EXISTS=$(command -v gitlab-runner)
    if [ "$C_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ] && [ "$MAJ_V" == "18.04" ]; then
            sudo apt-get install -y gitlab-runner
            sudo usermod -aG docker gitlab-runner
            DKR_EXISTS=$(command -v docker)
            if [ "$DKR_EXISTS" == "" ]; then
                sudo service docker restart
            fi
        elif [ "$DISTRO" == "redhat" ] && [ "$MAJ_V" == "7" ]; then
            C_EXISTS=$(command -v git)
            if [ "$C_EXISTS" == "" ]; then
                sudo tee -a /etc/yum.repos.d/WANdisco-git.repo >/dev/null <<EOF
[WANdisco-git]
name=WANdisco Git
baseurl=http://opensource.wandisco.com/rhel/\$releasever/git/\$basearch
gpgcheck=1
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-WANdisco
EOF
                sudo rpm --import http://opensource.wandisco.com/RPM-GPG-KEY-WANdisco
                sudo yum install -y git
            fi
            sudo yum install -y gitlab-runner
            DKR_EXISTS=$(command -v docker)
            if [ "$DKR_EXISTS" == "" ]; then
                sudo service docker restart
            fi
        fi
    fi
}

########################################
# 
########################################
dep_gluster_client() {
    C_EXISTS=$(command -v gluster)
    if [ "$C_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ] && [ "$MAJ_V" == "18.04" ]; then
            sudo apt-get install -y glusterfs-client
        elif [ "$DISTRO" == "redhat" ] && [ "$MAJ_V" == "7" ]; then
            sudo yum install -y glusterfs-server

            sudo systemctl stop glusterd
            sudo systemctl disable glusterd

            if [[ `sudo firewall-cmd --state` = running ]]; then
                sudo firewall-cmd --permanent --add-service=glusterfs
                sudo firewall-cmd --zone=public --add-port=24007-24008/tcp --permanent
                sudo firewall-cmd --zone=public --add-port=24009/tcp --permanent
                sudo firewall-cmd --zone=public --add-service=nfs --add-service=samba --add-service=samba-client --permanent
                sudo firewall-cmd --zone=public --add-port=111/tcp --add-port=139/tcp --add-port=445/tcp --add-port=965/tcp --add-port=2049/tcp --add-port=38465-38469/tcp --add-port=631/tcp --add-port=111/udp --add-port=963/udp --add-port=49152-49251/tcp --permanent
                sudo firewall-cmd --reload
            fi
        fi
    fi
}

########################################
# 
########################################
dep_mosquitto() {
    C_EXISTS=$(command -v mosquitto_pub)
    if [ "$C_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                # sudo apt-get install -y libc-ares2
                sudo apt-get install -y mosquitto-clients
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                sudo yum install -y mosquitto
                sudo systemctl stop mosquitto
                sudo systemctl disable mosquitto
            fi
        fi
    fi
}

########################################
# 
########################################
dep_tar() {
    TAR_EXISTS=$(command -v tar)
    if [ "$TAR_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
           sudo apt-get install -y tar
        elif [ "$DISTRO" == "redhat" ]; then
            sudo yum -y install tar
        fi
    fi
}

########################################
# 
########################################
dep_sshpass() {
    SSHPASS_EXISTS=$(command -v sshpass)
    if [ "$SSHPASS_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
           sudo apt-get install -y sshpass
        elif [ "$DISTRO" == "redhat" ]; then
            sudo yum -y install sshpass
        fi
    fi
}

########################################
# 
########################################
dep_unzip() {
    UNZIP_EXISTS=$(command -v unzip)
    if [ "$UNZIP_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
           sudo apt-get install -y unzip
        elif [ "$DISTRO" == "redhat" ]; then
            sudo yum -y install unzip
        fi
    fi
}



########################################
# 
########################################
dep_pm2() {
    PM2_EXISTS=$(command -v pm2)
    if [ "$PM2_EXISTS" == "" ]; then
        sudo npm install pm2@latest -g
    fi
}

########################################
# 
########################################
dep_helm() {
    HELM_EXISTS=$(command -v helm)
    if [ "$HELM_EXISTS" == "" ]; then
        curl https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash
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