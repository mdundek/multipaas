#!/bin/bash

########################################
# 
########################################
rpm_offline_install_redhat_7() {
    if [ ! -d "../../build/offline_files/rpms/$PK_FOLDER_NAME/$1" ]; then
        error "The local rpm files for dependecy $1 have not been found.\n"
        error "Please run the preparation script first before continuing.\n"
        exit 1
    fi
    if [ "$2" == "nobest" ]; then
        sudo yum install -y --cacheonly --nobest --skip-broken --disablerepo=* ../../build/offline_files/rpms/$PK_FOLDER_NAME/$1/*.rpm
    else
        sudo yum install -y --cacheonly --disablerepo=* ../../build/offline_files/rpms/$PK_FOLDER_NAME/$1/*.rpm
    fi
}

########################################
# 
########################################
deb_offline_install_ubuntu_bionic() {
    if [ ! -d "../build/ubuntu_bionic/debs/$1" ] && [ ! -d "../../build/offline_files/debs/$PK_FOLDER_NAME/$1" ]; then
        error "The local lib files for dependecy $1 have not been found.\n"
        error "Please run the preparation script first before continuing.\n"
        exit 1
    fi
    if [ -d "../build/ubuntu_bionic/debs/$1" ]; then
        sudo dpkg -i ../build/ubuntu_bionic/debs/$1/*.deb
    else
        sudo dpkg -i ../../build/offline_files/debs/$PK_FOLDER_NAME/$1/*.deb
    fi
}


setup_centos_7_extra_repo() {
    if [ ! -d "/var/www/html/repos" ]; then
        # sudo yum install httpd
        sudo cp -R "../../build/offline_files/rpms/$PK_FOLDER_NAME/offline-repo-files" "/var/www/html/"
        sudo mv "/var/www/html/offline-repo-files" "/var/www/html/repos"
        sudo chmod a+w /var/www/html/repos -R
        restorecon -vR /var/www/html
        # sudo systemctl enable httpd
        # sudo systemctl start httpd

        sudo tee -a /etc/yum.repos.d/mp.repo >/dev/null <<'EOF'
[rhel-7-server-extras-rpms]
name=local-rhel-7-server-extras-rpms
baseurl=file:///var/www/html/repos/rhel-7-server-extras-rpms
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-redhat-release
enabled=1
gpgcheck=0
EOF
        sudo chmod  u+rw,g+r,o+r /etc/yum.repos.d/mp.repo

        cd /var/www/html/repos/rhel-7-server-extras-rpms
        sudo chmod a+w /var/www/html/repos -R
        createrepo /var/www/html/repos/rhel-7-server-extras-rpms
        yum repolist
        yum clean all
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
                deb_offline_install_ubuntu_bionic "wget"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                rpm_offline_install_redhat_7 "wget"
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
                deb_offline_install_ubuntu_bionic "curl"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                rpm_offline_install_redhat_7 "curl"
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
            if [ "$DISTRO" == "redhat" ]; then
                sudo npm uninstall npm -g
                sudo yum remove -y nodejs
            fi
            INSTALL_NODE=1
        fi 
    fi
    if [ $INSTALL_NODE = 1 ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                sudo rm -rf /opt/nodejs
                sudo mkdir -p /opt/nodejs
                sudo chmod -R 755 /opt/nodejs
                sudo cp ../../build/offline_files/debs/ubuntu_bionic/nodejs/node-v12.18.0-linux-x64.tar.xz /opt
                cd /opt
                sudo tar xf /opt/node-v12.18.0-linux-x64.tar.xz --directory /opt/nodejs
                sudo rm -rf /opt/node-v12.18.0-linux-x64.tar.xz
                sudo mv /opt/nodejs/node-v12.18.0-linux-x64/* /opt/nodejs
                sudo rm -rf /opt/nodejs/node-v12.18.0-linux-x64
                sed -i.bak '/NODEJS_HOME/d' ~/.profile
                sed -i.bak '/NODEJS_HOME/d' ~/.bashrc
                echo 'export NODEJS_HOME=/opt/nodejs/bin' >> ~/.profile
                echo 'export PATH=$NODEJS_HOME:$PATH' >> ~/.profile
                echo 'export NODEJS_HOME=/opt/nodejs/bin' >> ~/.bashrc
                echo 'export PATH=$NODEJS_HOME:$PATH' >> ~/.bashrc
                source ~/.profile
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                sudo rm -rf /opt/nodejs
                sudo mkdir -p /opt/nodejs
                sudo chmod -R 755 /opt/nodejs
                sudo cp ../../build/offline_files/rpms/redhat_seven/nodejs/node-v12.18.0-linux-x64.tar.xz /opt
                cd /opt
                sudo tar xf /opt/node-v12.18.0-linux-x64.tar.xz --directory /opt/nodejs
                sudo rm -rf /opt/node-v12.18.0-linux-x64.tar.xz
                sudo mv /opt/nodejs/node-v12.18.0-linux-x64/* /opt/nodejs
                sudo rm -rf /opt/nodejs/node-v12.18.0-linux-x64
                sed -i.bak '/NODEJS_HOME/d' ~/.bashrc
                echo 'export NODEJS_HOME=/opt/nodejs/bin' >> ~/.bashrc
                echo 'export PATH=$NODEJS_HOME:$PATH' >> ~/.bashrc
                source ~/.bashrc
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
                deb_offline_install_ubuntu_bionic "containerd"
                deb_offline_install_ubuntu_bionic "docker-ce-cli"
                deb_offline_install_ubuntu_bionic "docker-ce" && sudo usermod -aG docker $USER
                sudo systemctl start docker
                sudo systemctl enable docker
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                tar xzvf ../../build/offline_files/rpms/$PK_FOLDER_NAME/docker/docker-*.tgz -C ../../build/offline_files/rpms/$PK_FOLDER_NAME/docker
                sudo mv ../../build/offline_files/rpms/$PK_FOLDER_NAME/docker/docker/* /usr/bin/
                sudo tee -a /etc/systemd/system/docker.service >/dev/null <<'EOF'
[Unit]
Description=Docker Application Container Engine
Documentation=https://docs.docker.com
After=network-online.target docker.socket firewalld.service
Wants=network-online.target
Requires=docker.socket

[Service]
Type=notify
# the default is not to use systemd for cgroups because the delegate issues still
# exists and systemd currently does not support the cgroup feature set required
# for containers run by docker
ExecStart=/usr/bin/dockerd -H fd://
ExecReload=/bin/kill -s HUP $MAINPID
LimitNOFILE=1048576
# Having non-zero Limit*s causes performance problems due to accounting overhead
# in the kernel. We recommend using cgroups to do container-local accounting.
LimitNPROC=infinity
LimitCORE=infinity
# Uncomment TasksMax if your systemd version supports it.
# Only systemd 226 and above support this version.
#TasksMax=infinity
TimeoutStartSec=0
# set delegate yes so that systemd does not reset the cgroups of docker containers
Delegate=yes
# kill only the docker process, not all processes in the cgroup
KillMode=process
# restart the docker process if it exits prematurely
Restart=on-failure
StartLimitBurst=3
StartLimitInterval=60s

[Install]
WantedBy=multi-user.target
EOF
                sudo tee -a /etc/systemd/system/docker.socket >/dev/null <<'EOF'
[Unit]
Description=Docker Socket for the API

[Socket]
# If /var/run is not implemented as a symlink to /run, you may need to
# specify ListenStream=/var/run/docker.sock instead.
ListenStream=/run/docker.sock
SocketMode=0660
SocketUser=root
SocketGroup=docker

[Install]
WantedBy=sockets.target
EOF
                sudo chmod +rwx /etc/systemd/system/docker.*
                
                sudo groupadd docker
                sudo usermod -aG docker $USER
                id -u multipaas &>/dev/null
                if [ "$?" == "0" ]; then
                    sudo usermod -aG docker multipaas
                fi

                sudo setenforce 0
                sudo sed -i '/SELINUX=/c\SELINUX=disabled' /etc/selinux/config
                
                sudo mkdir -p /etc/docker
                sudo tee -a /etc/docker/daemon.json >/dev/null <<EOF
{
  "exec-opts": ["native.cgroupdriver=systemd"],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m"
  },
  "storage-driver": "overlay2",
  "storage-opts": [
    "overlay2.override_kernel_check=true"
  ]
}      
EOF

                sudo mkdir -p /etc/systemd/system/docker.service.d

                sudo systemctl daemon-reload
                sudo systemctl enable docker
                sudo systemctl start docker
            fi
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
dep_vbox() {
    cd $_DIR
    VIRTUALBOX_EXISTS=$(command -v vboxmanage)
    if [ "$VIRTUALBOX_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                deb_offline_install_ubuntu_bionic "make"
                deb_offline_install_ubuntu_bionic "perl"
                deb_offline_install_ubuntu_bionic "gcc"
                sudo dpkg -i ../build/ubuntu_bionic/debs/virtualbox-6.1/libpython2.7-minimal_*.deb
                sudo dpkg -i ../build/ubuntu_bionic/debs/virtualbox-6.1/python2.7-minimal_*.deb
                sudo dpkg -i ../build/ubuntu_bionic/debs/virtualbox-6.1/python-minimal_*.deb
                deb_offline_install_ubuntu_bionic "virtualbox-6.1" && sudo usermod -aG vboxusers $USER
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            error "Virtualbox is required, but it is not installed.\n" 
            warn "Please install Virtualbox manually first, then run this script again.\n"
            exit 1
        fi
    fi
    VAGRANT_EXISTS=$(command -v vagrant)
    if [ "$VAGRANT_EXISTS" == "" ]; then
        if [ "$DISTRO" == "ubuntu" ]; then
            if [ "$MAJ_V" == "18.04" ]; then
                deb_offline_install_ubuntu_bionic "vagrant"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                rpm_offline_install_redhat_7 "vagrant"
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
                deb_offline_install_ubuntu_bionic "kubeadm"
                deb_offline_install_ubuntu_bionic "kubectl"
                deb_offline_install_ubuntu_bionic "kubelet"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                rpm_offline_install_redhat_7 "kubernetes-cni"
                rpm_offline_install_redhat_7 "kubeadm"
                rpm_offline_install_redhat_7 "kubectl"
                rpm_offline_install_redhat_7 "kubelet"
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
                deb_offline_install_ubuntu_bionic "libonig4"
                deb_offline_install_ubuntu_bionic "jq"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                rpm_offline_install_redhat_7 "jq"
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
                deb_offline_install_ubuntu_bionic "gitlab-runner"
                sudo usermod -aG docker gitlab-runner
                DKR_EXISTS=$(command -v docker)
                if [ "$DKR_EXISTS" == "" ]; then
                    sudo service docker restart
                fi
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                rpm_offline_install_redhat_7 "gitlab-runner"
                DKR_EXISTS=$(command -v docker)
                if [ "$DKR_EXISTS" == "" ]; then
                    sudo service docker restart
                fi
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
                # deb_offline_install_ubuntu_bionic "glibc-doc-reference"
                # deb_offline_install_ubuntu_bionic "libc6-dev"
                # deb_offline_install_ubuntu_bionic "libnl-3-200"
                deb_offline_install_ubuntu_bionic "glusterfs-client"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                rpm_offline_install_redhat_7 "glusterfs"
                rpm_offline_install_redhat_7 "glusterfs-fuse"
                sudo firewall-cmd --permanent --add-service=glusterfs
                sudo firewall-cmd --reload
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
                deb_offline_install_ubuntu_bionic "libc-ares2"
                deb_offline_install_ubuntu_bionic "mosquitto-clients"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                rpm_offline_install_redhat_7 "mosquitto"
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
                deb_offline_install_ubuntu_bionic "tar"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                rpm_offline_install_redhat_7 "tar"
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
                deb_offline_install_ubuntu_bionic "unzip"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                rpm_offline_install_redhat_7 "unzip"
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
                deb_offline_install_ubuntu_bionic "sshpass"
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                rpm_offline_install_redhat_7 "sshpass"
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
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                if [ -d "$PM2_INSTALL_DIR/pm2" ]; then
                    sudo rm -rf $PM2_INSTALL_DIR/pm2
                fi
                if [ -d "$PM2_INSTALL_DIR/package" ]; then
                    sudo rm -rf $PM2_INSTALL_DIR/package
                fi
                if [ -d "../../build/offline_files/npm-modules" ]; then
                    sudo tar xpf ../../build/offline_files/npm-modules/pm2-4.4.0.tgz -C $PM2_INSTALL_DIR
                else
                    echo "PM2 binary has not been found"
                    exit 1
                fi
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
                    sudo tar xvf ../../build/offline_files/debs/ubuntu_bionic/helm/helm-v3.2.3-linux-amd64.tar.gz -C ../../build/offline_files/debs/ubuntu_bionic/helm
                    sudo mv ../../build/offline_files/debs/ubuntu_bionic/helm/linux-amd64/helm /usr/local/bin/
                else
                    echo "HELM binary has not been found"
                    exit 1
                fi
            fi
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "7" ]; then
                if [ -d "../../build/offline_files/debs" ]; then
                    sudo tar xvf ../../build/offline_files/rpms/redhat_seven/helm/helm-v3.2.3-linux-amd64.tar.gz -C ../../build/offline_files/rpms/redhat_seven/helm
                    sudo mv ../../build/offline_files/rpms/redhat_seven/helm/linux-amd64/helm /usr/local/bin/
                else
                    echo "HELM binary has not been found"
                    exit 1
                fi
            fi
        fi
    fi
}
