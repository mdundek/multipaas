#!/bin/bash

########################################
# DETERMINE DISTRO
########################################
distro() {
    # Determine OS platform
    UNAME=$(uname | tr "[:upper:]" "[:lower:]")
    # If Linux, try to determine specific distribution
    if [ "$UNAME" == "linux" ]; then
        # If available, use LSB to identify distribution
        if [ -f /etc/lsb-release -o -d /etc/lsb-release.d ]; then
            export DISTRO=$(lsb_release -i | cut -d: -f2 | sed s/'^\t'// | tr '[:upper:]' '[:lower:]')
        # Otherwise, use release info file
        else
            export DISTRO=$(ls -d /etc/[A-Za-z]*[_-][rv]e[lr]* | grep -v "lsb" | cut -d'/' -f3 | cut -d'-' -f1 | cut -d'_' -f1 | tr '[:upper:]' '[:lower:]')
            if [[ $DISTRO == *"redhat"* ]; then
                DISTRO="redhat"
            fi
            if [[ $DISTRO == *"centos"* ]]; then
                DISTRO="centos"
            fi
        fi
    fi
    # For everything else (or if above failed), just use generic identifier
    [ "$DISTRO" == "" ] && export DISTRO=$UNAME
    unset UNAME

    if [ "$DISTRO" == "ubuntu" ]; then
        MAJ_V=$(lsb_release -sr)
        if [ "$MAJ_V" != "18.04" ]; then
            echo "Unsupported Ubuntu version. This script only works on Ubuntu 18.04"
            exit 1
        fi
    elif [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
        MAJ_V_8=$(cat /etc/os-release | grep "VERSION=\"8")
        if [ "$MAJ_V_8" != "" ]; then
            MAJ_V="8"
        else
            echo "Unsupported RedHat / CentOS version. This script only works on versions 8"
            exit 1
        fi
    else
        echo "Unsupported OS. This script only works on Ubuntu 18.04, RedHat 8 and CentOS 8"
        exit 1
    fi
}