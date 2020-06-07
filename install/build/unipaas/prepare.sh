#!/bin/bash

####################### Position to script folder
_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"
cd $_DIR

err_log=$_DIR/std.log

. ../../_libs/common.sh
. ../../_libs/distro.sh
. ../../_libs/dep_online.sh
. ../../_libs/update.sh

########################################
# RESOLVE DEPEENDENCIES
########################################
dependencies () {
    log "==> This script will download all required files to install MultiPaaS in single tenant mode for online/offline environements.\n"
    log "\n"
    read_input "Do you wish to continue (y/n)?" CONTINUE_INSTALL
    while [[ "$CONTINUE_INSTALL" != 'y' ]] && [[ "$CONTINUE_INSTALL" != 'n' ]]; do
        read_input "Invalide answer, try again (y/n)?" CONTINUE_INSTALL
    done
    if [ "$CONTINUE_INSTALL" == "n" ]; then
        exit 0
    fi

    sudo echo "" # Ask user for sudo password now

    dep_wget &>>$err_log &
    bussy_indicator "Dependency on \"wget\"..."
    log "\n"
}

########################################
# BUILD FOR TARGET UBUNTU
########################################
build_for_ubuntu_bionic() {
    cd $_DIR



}

########################################
# LOGIC...
########################################
/usr/bin/clear

base64 -d <<<"IF9fICBfXyAgICAgIF8gXyAgIF8gX19fICAgICAgICAgICBfX18gX19fICAgICAgXyBfICAgIF8gICAgICAgICAKfCAgXC8gIHxfICBffCB8IHxfKF8pIF8gXF9fIF8gX18gXy8gX198IF8gKV8gIF8oXykgfF9ffCB8X19fIF8gXyAKfCB8XC98IHwgfHwgfCB8ICBffCB8ICBfLyBfYCAvIF9gIFxfXyBcIF8gXCB8fCB8IHwgLyBfYCAvIC1fKSAnX3wKfF98ICB8X3xcXyxffF98XF9ffF98X3wgXF9fLF9cX18sX3xfX18vX19fL1xfLF98X3xfXF9fLF9cX19ffF98ICA="
log "\n\n"

# Determine current distro
distro
if [ "$DISTRO" != "ubuntu" ] || [ "$MAJ_V" != "18.04" ]; then
    echo "Unsupported OS. This script only works on Ubuntu 18.04"
    exit 1
fi

# Install dependencies
dependencies
log "\n"

build_for_ubuntu_bionic
log "\n"

log "\n"
success "Build process done! You can now proceed to the installation of the control-plane as well as the host-node.\n"

# Go back to initial folder
cd "$_PWD"