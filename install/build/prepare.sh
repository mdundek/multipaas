#!/bin/bash

####################### Position to script folder
_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"
cd $_DIR

err_log=$_DIR/std.log

. ../_libs/common.sh
. ../_libs/distro.sh
. ../_libs/dep_online.sh
. ../_libs/update.sh
. ../_libs/mp_base_boxes/base_boxes.sh

SKIP_BASE_BOX=0
SKIP_K8S_BOXES=0
SKIP_TARGET_BUILD=0
INSTALL_K8S_BOXES=0
INSTALL_BASE_BOX=0
PRESERVE_BASE_BOX=0
usage() {
    echo 'usage: ./prepare.sh 
        [-skbb | --skip-base-box]
        [-skkb | --skip-k8s-boxes]
        [-sktb | --skip-target-build]
        [-pbb | --preserve-base-box]
        [-ibb | --install-base-box]
        [-ikb | --install-k8s-boxes]
        [-h | --help]'
}
while [ "$1" != "" ]; do
    case $1 in
        -skbb | --skip-base-box )       SKIP_BASE_BOX=1
                                    ;;
        -skkb | --skip-k8s-boxes )      SKIP_K8S_BOXES=1
                                    ;;
        -sktb | --skip-target-build )   SKIP_TARGET_BUILD=1
                                    ;;
        -ibb | --install-base-box )     INSTALL_BASE_BOX=1
                                    ;;
        -ikb | --install-k8s-boxes )    INSTALL_K8S_BOXES=1
                                    ;;
        -pbb | --preserve-base-box )    PRESERVE_BASE_BOX=1
                                    ;;
        -h | --help )                   usage
                                        exit
                                    ;;
        * )                             usage
                                        exit 1
    esac
    shift
done

########################################
# RESOLVE DEPEENDENCIES
########################################
dependencies () {
    if [ "$SKIP_BASE_BOX" = "0" ] || [ "$SKIP_K8S_BOXES" = "0" ] || [ "$SKIP_TARGET_BUILD" = "0" ]; then
        VB_EXISTS=$(command -v vboxmanage)
        VAG_EXISTS=$(command -v vagrant)
        if [ "$VAG_EXISTS" == "" ] || [ "$VB_EXISTS" == "" ]; then
            log "==> This script will install the following components:\n"
            log "\n"
        else
            log "==> This script will download all required files to install MultiPaaS in online/offline environements.\n"
        fi
        if [ "$VAG_EXISTS" == "" ]; then
            log "- Vagrant\n"
        fi
        if [ "$VB_EXISTS" == "" ]; then
            log "- VirtualBox\n"
        fi
        log "\n"
        yes_no "Do you wish to continue" CONTINUE_INSTALL
        if [ "$CONTINUE_INSTALL" == "n" ]; then
            exit 0
        fi

        sudo echo "" # Ask user for sudo password now

        dep_wget &>>$err_log &
        bussy_indicator "Dependency on \"wget\"..."
        log "\n"

        dep_vbox &>>$err_log &
        bussy_indicator "Dependency on \"VirtualBox & Vagrant\"..."
        log "\n"

        if [ "$VB_EXISTS" == "" ] && [ "$DISTRO" == "redhat" ]; then
            log "\n"
            warn "Vagrant has been installed on your machine. This installation requires a reboot in order to proceed.\n"
            warn "After having rebooted, execute the following command to finish the virtualbox installation:\n"
            log "\n"
            log "    sudo /sbin/vboxconfig\n"
            log "\n"
            warn "Then re-run this script to proceed.\n"
            exit 1
        fi
    fi
}

########################################
# BUILD FOR TARGET CENTOS
########################################
build_for_centos() {
    cd $_DIR

    cd centos8/vagrant

    VM_EXISTS=$(vboxmanage list vms | cut -d ' ' -f 1 | grep '"multipaas-prepare"')
    if [ "$VM_EXISTS" != "" ]; then
        PREPARE_BOX_UP=$(vboxmanage showvminfo "multipaas-prepare" | grep -e ^State | grep " running ")
        if [ "$PREPARE_BOX_UP" != "" ]; then
            log "VM is already up and running, skipping init\n"
        else
            PREPARE_BOX_OFF=$(vboxmanage showvminfo "multipaas-prepare" | grep -e ^State | grep "powered\|aborted\|paused")
            if [ "$PREPARE_BOX_OFF" != "" ]; then
                vagrant up --no-provision &>>$err_log &
                bussy_indicator "VM is stopped, starting up again..."
                log "\n"
            fi
        fi
    else
        vagrant up --no-provision &>>$err_log &
        bussy_indicator "Starting CentOS8 VM to prepare the environement..."
        log "\n"

        vagrant provision --provision-with init &>>$err_log &
        bussy_indicator "Preparing environement..."
        log "\n"
    fi

    vagrant provision --provision-with rpms &>>$err_log &
    bussy_indicator "Downloading RMP packages..."
    log "\n"

    vagrant provision --provision-with docker &>>$err_log &
    bussy_indicator "Downloading Docker images..."
    log "\n"

    vagrant provision --provision-with mp-hn &>>$err_log &
    bussy_indicator "Preparing host-node environement..."
    log "\n"

    vagrant provision --provision-with mp-cp &>>$err_log &
    bussy_indicator "Building control-plane image..."
    log "\n"
}

########################################
# BUILD FOR TARGET UBUNTU
########################################
build_for_ubuntu_bionic() {
    cd $_DIR

    cd ubuntu_bionic/vagrant

    VM_EXISTS=$(vboxmanage list vms | cut -d ' ' -f 1 | grep '"multipaas-prepare"')
    if [ "$VM_EXISTS" != "" ]; then
        PREPARE_BOX_UP=$(vboxmanage showvminfo "multipaas-prepare" | grep -e ^State | grep " running ")
        if [ "$PREPARE_BOX_UP" != "" ]; then
            log "VM is already up and running, skipping init\n"
        else
            PREPARE_BOX_OFF=$(vboxmanage showvminfo "multipaas-prepare" | grep -e ^State | grep "powered\|aborted\|paused")
            if [ "$PREPARE_BOX_OFF" != "" ]; then
                vagrant up --no-provision &>>$err_log &
                bussy_indicator "VM is stopped, starting up again..."
                log "\n"
            fi
        fi
    else
        vagrant up --no-provision &>>$err_log &
        bussy_indicator "Starting Ubuntu VM to prepare the environement..."
        log "\n"

        vagrant provision --provision-with init &>>$err_log &
        bussy_indicator "Preparing environement..."
        log "\n"
    fi

    vagrant provision --provision-with debs &>>$err_log &
    bussy_indicator "Downloading DEP packages..."
    log "\n"

    vagrant provision --provision-with docker &>>$err_log &
    bussy_indicator "Downloading Docker images..."
    log "\n"

    vagrant provision --provision-with mp-hn &>>$err_log &
    bussy_indicator "Preparing host-node environement..."
    log "\n"

    vagrant provision --provision-with mp-cp &>>$err_log &
    bussy_indicator "Building control-plane image..."
    log "\n"
}

########################################
# LOGIC...
########################################
/usr/bin/clear

base64 -d <<<"IF9fICBfXyAgICAgIF8gXyAgIF8gX19fICAgICAgICAgICBfX18gX19fICAgICAgXyBfICAgIF8gICAgICAgICAKfCAgXC8gIHxfICBffCB8IHxfKF8pIF8gXF9fIF8gX18gXy8gX198IF8gKV8gIF8oXykgfF9ffCB8X19fIF8gXyAKfCB8XC98IHwgfHwgfCB8ICBffCB8ICBfLyBfYCAvIF9gIFxfXyBcIF8gXCB8fCB8IHwgLyBfYCAvIC1fKSAnX3wKfF98ICB8X3xcXyxffF98XF9ffF98X3wgXF9fLF9cX18sX3xfX18vX19fL1xfLF98X3xfXF9fLF9cX19ffF98ICA="
log "\n\n"

# Determine current distro
distro

# Install dependencies
dependencies
log "\n"

# GET LOCAL NETWORK INTERFACE
# get_network_interface_ip TARGET_IFACE TARGET_IP
# log "\n"

if [ "$SKIP_BASE_BOX" = "0" ]; then
    build_base_box
    install_base_box
    if [ "$PRESERVE_BASE_BOX" = "0" ]; then
        destroy_base_boxes
    fi
fi

if [ "$SKIP_K8S_BOXES" = "0" ]; then
    k8s_build_base_boxes
fi

if [ "$INSTALL_BASE_BOX" = "1" ]; then
    install_base_box
fi

if [ "$INSTALL_K8S_BOXES" = "1" ]; then
    k8s_install_base_boxes
fi

if [ "$SKIP_TARGET_BUILD" = "0" ]; then
    log "\n"
    # GET TARGET OS FOR BUILD
    distros=("CentOS 8 / RedHat 8" "Ubuntu 18.04")
    combo_index TARGET_OS "On what OS will you install the control-plane and the host-nodes?" "Your OS choice #:" "${distros[@]}"
    TARGET_OS=$(($TARGET_OS+1))
    log "\n"

    # Build for CentOS 8
    if [ "$TARGET_OS" = "1" ]; then
        build_for_centos
    fi

    # Build for Ubuntu >= 18.04
    if [ "$TARGET_OS" = "2" ]; then
        build_for_ubuntu_bionic
    fi
fi

log "\n"
success "Build process done! You can now proceed to the installation of the control-plane as well as the host-nodes.\n"

# Go back to initial folder
cd "$_PWD"