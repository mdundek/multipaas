#!/bin/bash

########################################
# 
########################################
update() {
    if [ "$DISTRO" == "ubuntu" ]; then
        sudo apt-get -y update &>>$err_log &
        bussy_indicator "Updating system..."
    elif [ "$DISTRO" == "redhat" ]; then
        CKERNEL=$(uname -r)
        sudo yum -y update &>>$err_log &
        bussy_indicator "Updating system..."
        log "\n"
        CKERNELAFTER=$(uname -r)
        if [ "$CKERNEL" != "$CKERNELAFTER" ]; then
            warn "Your kernal version has been updated! Please reboot the system, and run this script again."
            log "\n"
            exit 1 
        fi
    fi
}