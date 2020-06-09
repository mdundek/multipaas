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
            if [ "$MAJ_V" == "8" ]; then
                sudo dnf -y install wget
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
        elif [ "$DISTRO" == "redhat" ]; then
            echo "OS not supported yet"
            exit 1
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
        elif [ "$DISTRO" == "redhat" ]; then
            echo "OS not supported yet"
            exit 1
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
        elif [ "$DISTRO" == "redhat" ]; then
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
        elif [ "$DISTRO" == "redhat" ]; then
            if [ "$MAJ_V" == "8" ]; then
                sudo dnf -y install https://releases.hashicorp.com/vagrant/2.2.7/vagrant_2.2.7_x86_64.rpm
            fi
        fi
    fi

    VAGRANT_VGA_PLUGIN_EXISTS=$(vagrant plugin list | grep "vagrant-vbguest")
    if [ "$VAGRANT_VGA_PLUGIN_EXISTS" == "" ]; then
        vagrant plugin install vagrant-vbguest
    fi
}