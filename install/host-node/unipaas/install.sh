#!/bin/bash

_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"
cd $_DIR

err_log=$_DIR/std.log

. ../../_libs/common.sh
. ../../_libs/distro.sh
. ../../_libs/dep_offline.sh

_BASEDIR="$(dirname "$_DIR")"
_BASEDIR="$(dirname "$_BASEDIR")"

########################################
# 
########################################
dependencies () {
    DOCKER_EXISTS=$(command -v docker)
    NODE_EXISTS=$(command -v node)
    PM2_EXISTS=$(command -v pm2)

    if [ "$IS_K8S_NODE" == "true" ]; then
        if [ "$DOCKER_EXISTS" == "" ] || [ "$NODE_EXISTS" == "" ] || [ "$PM2_EXISTS" == "" ]; then
            log "==> This script will install the following components:\n"
            log "\n"
        else
            log "==> This script will install and configure the host-node services.\n"
        fi
    else
        if [ "$DOCKER_EXISTS" == "" ] || [ "$NODE_EXISTS" == "" ] || [ "$PM2_EXISTS" == "" ]; then
            log "==> This script will install the following components:\n"
            log "\n"
        else
            log "==> This script will install and configure the host-node services.\n"
        fi
    fi

    if [ "$DOCKER_EXISTS" == "" ]; then
        log "- Docker CE\n"
    fi
    if [ "$NODE_EXISTS" == "" ]; then
        log "- NodeJS\n"
    fi
    if [ "$PM2_EXISTS" == "" ]; then
        log "- PM2\n"
    fi
    log "\n"
    read_input "Do you wish to continue (y/n)?" CONTINUE_INSTALL
    while [[ "$CONTINUE_INSTALL" != 'y' ]] && [[ "$CONTINUE_INSTALL" != 'n' ]]; do
        read_input "Invalide answer, try again (y/n)?" CONTINUE_INSTALL
    done
    if [ "$CONTINUE_INSTALL" == "n" ]; then
        exit 0
    fi

    sudo echo "" # Ask user for sudo password now

    if [ "$IS_K8S_NODE" == "true" ]; then
        dep_tar &>>$err_log &
        bussy_indicator "Dependency on \"tar\"..."
        log "\n"

        dep_sshpass &>>$err_log &
        bussy_indicator "Dependency on \"sshpass\"..."
        log "\n"
    fi

    dep_docker &>>$err_log &
    bussy_indicator "Dependency on \"Docker CE\"..."
    log "\n"

    dep_nodejs &>>$err_log &
    bussy_indicator "Dependency on \"NodeJS\"..."
    log "\n"

    






    PM2_EXISTS=$(command -v pm2)
    if [ "$PM2_EXISTS" == "" ]; then
        PM2_INSTALL_DIR=/opt
        tar xpf ../../build/offline_files/npm-modules/pm2-4.4.0.tgz -C $PM2_INSTALL_DIR
           
        if [ -d "$PM2_INSTALL_DIR/package" ]; then
            sudo mv $PM2_INSTALL_DIR/package $PM2_INSTALL_DIR/pm2
        fi
        sudo bash -c 'cat <<EOF > "/etc/profile.d/node.sh"
#!/bin/sh
export PATH="'$PM2_INSTALL_DIR'/pm2/bin:\$PATH"
EOF'
        . /etc/profile.d/node.sh
    fi











    if [ "$IS_GLUSTER_PEER" == "true" ]; then
        GLUSTER_IMG_EXISTS=$(sudo docker images gluster/gluster-centos:gluster4u0_centos7 | sed -n '1!p')
        if [ "$GLUSTER_IMG_EXISTS" == "" ]; then
            if [ "$DISTRO" == "ubuntu" ]; then
                if [ "$MAJ_V" == "18.04" ]; then
                    sudo docker load --input ../build/ubuntu_bionic/docker-images/gluster-centos-gluster4u0_centos7.tar
                fi
            elif [ "$DISTRO" == "redhat" ]; then
                if [ "$MAJ_V" == "8" ]; then
                    sudo docker load --input ../build/centos8/docker-images/gluster-centos-gluster4u0_centos7.tar
                fi
            fi

        fi
    fi
    cd unipaas
}

########################################
# 
########################################
collect_informations() {
    get_network_interface_ip IFACE LOCAL_IP

    log "\n"
    read_input "Enter the control-plane VM IP:" MASTER_IP  
    log "\n"
    read_input "Enter the PostgreSQL database password (same than the MultiPaaS admin password chosen during the control-plane installation):" PW
    log "\n"

    if [ "$IS_GLUSTER_PEER" == "true" ]; then   
        # Select filesystem that is used for Gluster
        FSL=$(df -h | sed 's/|/ /' | awk '{print $1}')
        readarray -t _FSLarrIN <<<"$FSL"
        FSLarrIN=("${_FSLarrIN[@]:1}")

        FSLSIZE=$(df -h | sed 's/|/ /' | awk '{print $2}')
        readarray -t _FSLSIZEarrIN <<<"$FSLSIZE"
        FSLSIZEarrIN=("${_FSLSIZEarrIN[@]:1}")

        # Find the proper column index for this OS
        FSLMOUNT_STRINGTEST=$(df -h | sed 's/|/ /')
        STRINGTEST=(${FSLMOUNT_STRINGTEST[@]})
        COL_INDEX=0
        for i in "${STRINGTEST[@]}"
        do : 
            COL_INDEX=$((COL_INDEX+1))
            if [[ $i = "Mounted" ]]
            then
                TRG_INDEX=$COL_INDEX
                break
            fi
        done

        FSLMOUNT=$(df -h | sed 's/|/ /' | awk '{print $'"$TRG_INDEX"'}')
        readarray -t _FSLMOUNTarrIN <<<"$FSLMOUNT"
        FSLMOUNTarrIN=("${_FSLMOUNTarrIN[@]:1}")

        VALID_FS=()
        VALID_MOUNTS=()

        FS_INDEX=0
        for i in "${FSLarrIN[@]}"
        do : 
            if [[ $i = /dev/* ]]
            then
                VALID_FS+=("$i (${FSLSIZEarrIN[$FS_INDEX]})")
                VALID_MOUNTS+=("${FSLMOUNTarrIN[$FS_INDEX]}")
            fi
            FS_INDEX=$((FS_INDEX+1))
        done

        log "\n"
        combo_index MOUNT_INDEX "What filesystem is used for your volume provisionning" "Your choice #:" "${VALID_FS[@]}"

        VOL_FULL_NAME=(${VOL_NAME// / })
        VOL_NAME=(${VOL_FULL_NAME//\// })

        if [ "${VALID_MOUNTS[$MOUNT_INDEX]}" == "/" ]; then
            BRICK_MOUNT_PATH="/bricks"
        else
            BRICK_MOUNT_PATH="${VALID_MOUNTS[$MOUNT_INDEX]}/bricks"
        fi

        GLUSTER_VOLUME="${VOL_NAME[1]}"
    fi
}

########################################
# 
########################################
authorize_private_registry() {
    sshpass -p 'kubeadmin' scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no vagrant@$MASTER_IP:/home/vagrant/configPrivateRegistry.sh ./configPrivateRegistry.sh &>/dev/null
    sudo ./configPrivateRegistry.sh &>/dev/null
    rm -rf ./configPrivateRegistry.sh &>/dev/null
}

########################################
# 
########################################
install_core_components() {
    cd $_BASEDIR/src/host-node/ # Position cmd in src folder
    
    mkdir -p $HOME/.multipaas

    if [ "$IS_GLUSTER_PEER" == "true" ]; then
        mkdir -p $HOME/.multipaas/gluster/etc/glusterfs 2>&1 | log_error_sanitizer
        mkdir -p $HOME/.multipaas/gluster/var/lib/glusterd 2>&1 | log_error_sanitizer
        mkdir -p $HOME/.multipaas/gluster/var/log/glusterfs 2>&1 | log_error_sanitizer
        sudo mkdir -p $BRICK_MOUNT_PATH 2>&1 | log_error_sanitizer
    fi

    # if [ "$IS_K8S_NODE" == "true" ]; then
    cp env.template env

    VM_BASE=$HOME/.multipaas/vm_base
    MULTIPAAS_CFG_DIR=$HOME/.multipaas

    sed -i "s/<MP_MODE>/unipaas/g" ./env
    sed -i "s/<MASTER_IP>/$MASTER_IP/g" ./env
    sed -i "s/<DB_PORT>/5432/g" ./env
    sed -i "s/<DB_PASS>/$PW/g" ./env
    sed -i "s/<MOSQUITTO_PORT>/1883/g" ./env
    sed -i "s/<VM_BASE_HOME>/${VM_BASE//\//\\/}/g" ./env
    sed -i "s/<MULTIPAAS_CFG_DIR>/${MULTIPAAS_CFG_DIR//\//\\/}/g" ./env
    sed -i "s/<NET_INTEFACE>/$IFACE/g" ./env
    sed -i "s/<IS_K8S_NODE>/$IS_K8S_NODE/g" ./env
    sed -i "s/<IS_GLUSTER_PEER>/$IS_GLUSTER_PEER/g" ./env
    sed -i "s/<GLUSTER_VOL>/$GLUSTER_VOLUME/g" ./env

    cp env .env
    rm env

    log "\n"
    HOST_NODE_DEPLOYED=$(/opt/pm2/bin/pm2 ls | grep "multipaas-host-node")
    if [ "$HOST_NODE_DEPLOYED" == "" ]; then
        npm i
        /opt/pm2/bin/pm2 -s start index.js --watch --name multipaas-host-node --time
        /opt/pm2/bin/pm2 -s startup
        sudo env PATH=$PATH:/usr/bin /opt/pm2/bin/pm2 startup systemd -u $USER --hp $(eval echo ~$USER) &>>$err_log
        /opt/pm2/bin/pm2 -s save --force
    fi
}




########################################
# LOGIC...
########################################
# /usr/bin/clear

# base64 -d <<<"IF9fICBfXyAgICAgIF8gXyAgIF8gX19fICAgICAgICAgICBfX18gXyAgXyAgICAgICAgXyAgIF8gIF8gICAgICAgICBfICAgICAKfCAgXC8gIHxfICBffCB8IHxfKF8pIF8gXF9fIF8gX18gXy8gX198IHx8IHxfX18gX198IHxffCBcfCB8X19fICBfX3wgfF9fXyAKfCB8XC98IHwgfHwgfCB8ICBffCB8ICBfLyBfYCAvIF9gIFxfXyBcIF9fIC8gXyAoXy08ICBffCAuYCAvIF8gXC8gX2AgLyAtXykKfF98ICB8X3xcXyxffF98XF9ffF98X3wgXF9fLF9cX18sX3xfX18vX3x8X1xfX18vX18vXF9ffF98XF9cX19fL1xfXyxfXF9fX3w="
# log "\n\n"

# Figure out what distro we are running
distro

HN_TASK_LIST=("Kubernetes instances" "GlusterFS" "Both")
combo_value NODE_ROLE "What tasks should this host-node handle" "Your choice #:" "${HN_TASK_LIST[@]}"
if [ "$NODE_ROLE" == "Kubernetes instances" ]; then
    IS_K8S_NODE="true"
    IS_GLUSTER_PEER="false"
elif [ "$NODE_ROLE" == "GlusterFS" ]; then
    IS_K8S_NODE="false"
    IS_GLUSTER_PEER="true"
elif [ "$NODE_ROLE" == "Both" ]; then
    IS_K8S_NODE="true"
    IS_GLUSTER_PEER="true"
fi
log "\n"

# Install dependencies
dependencies

# Collect info from user
collect_informations


sudo sed '/multipaas.com/d' /etc/hosts &>>$err_log
sudo -- sh -c "echo $MASTER_IP multipaas.com multipaas.registry.com registry.multipaas.org multipaas.keycloak.com multipaas.gitlab.com multipaas.static.com >> /etc/hosts" &>>$err_log

# configure private registry
if [ "$IS_K8S_NODE" == "true" ]; then
    authorize_private_registry &>>$err_log &
    bussy_indicator "Authorize private registry..."
    log "\n"
    
fi

# Install the core components
install_core_components &>>$err_log &
bussy_indicator "Installing host controller components..."
log "\n"

log "\n"

success "[DONE] MultiPaaS host controller deployed successfully!\n"

if [ "$IS_GLUSTER_PEER" == "true" ]; then
    # Start the gluster controller
    if [ "$NEW_DOCKER" == "true" ]; then
        log "\n"
        warn "==> Since Docker was just installed, you will have to restart your session before starting the cluster-ctl container.\n"
        warn "    Please log out, and log back in, then execute the following command:\n"
        log "\n"
        log "    docker run \n"
        log "       -d --privileged=true \n"
        log "       --restart unless-stopped \n"
        log "       --net=host -v /dev/:/dev \n"
        log "       -v $HOME/.multipaas/gluster/etc/glusterfs:/etc/glusterfs:z \n"
        log "       -v $HOME/.multipaas/gluster/var/lib/glusterd:/var/lib/glusterd:z \n"
        log "       -v $HOME/.multipaas/gluster/var/log/glusterfs:/var/log/glusterfs:z \n"
        log "       -v $BRICK_MOUNT_PATH:/bricks:z \n"
        log "       -v /sys/fs/cgroup:/sys/fs/cgroup:ro \n"
        log "       --name gluster-ctl \n"
        log "       gluster/gluster-centos:gluster4u0_centos7\n"
    else
        docker rm -f gluster-ctl >/dev/null 2>&1
        
        docker run \
            -d --privileged=true \
            --restart unless-stopped \
            --net=host -v /dev/:/dev \
            -v $HOME/.multipaas/gluster/etc/glusterfs:/etc/glusterfs:z \
            -v $HOME/.multipaas/gluster/var/lib/glusterd:/var/lib/glusterd:z \
            -v $HOME/.multipaas/gluster/var/log/glusterfs:/var/log/glusterfs:z \
            -v $BRICK_MOUNT_PATH:/bricks:z \
            -v /sys/fs/cgroup:/sys/fs/cgroup:ro \
            --name gluster-ctl \
            gluster/gluster-centos:gluster4u0_centos7 &>/dev/null
    fi
    
    # Join the gluster network
    log "\n"
    warn "==> To add this Gluster peer to the Gluster network, execute the following command ON ANY OTHER GLUSTER peer host:\n"
    warn "    PLEASE NOTE: This is only necessary if this is NOT the first Gluster node for this Gluster network\n"
    log "\n"
    log "    docker exec gluster-ctl gluster peer probe $LOCAL_IP\n"
fi
log "\n"

cd "$_PWD"