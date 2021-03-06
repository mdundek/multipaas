#!/bin/bash

_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"
cd $_DIR

err_log=$_DIR/std.log

. ../../_libs/common.sh
. ../../_libs/distro.sh

_BASEDIR="$(dirname "$_DIR")"
_BASEDIR="$(dirname "$_BASEDIR")"
_BASEDIR="$(dirname "$_BASEDIR")"

########################################
# Error management
########################################
# on_exit() {
#     if [ "$1" != "0" ]; then
#         error "An error occured. For more details, check the file ./std.log\n"
#         error "\n"
#     fi
# }

remove_all() {
    local C_EXISTS=$(command -v docker)
    if [ "$C_EXISTS" != "" ]; then
        # Clean up first if necessary
        K8S_INSTALLED=$(docker ps -a | grep "k8s_kube-apiserver")
        if [ "$K8S_INSTALLED" != "" ]; then
            sudo kubeadm reset -f &>>$err_log
            sudo rm -rf /etc/cni/net.d
            sudo rm -rf /etc/default/kubelet
            sudo rm -rf $MP_HOME/.kube
        fi
    fi
    
    if [ -f "/etc/systemd/system/multipaas-hostnode.service" ]; then
        sudo systemctl stop multipaas-hostnode.service
        sudo systemctl disable multipaas-hostnode.service
        sudo rm -rf /etc/systemd/system/multipaas-hostnode.service
        sudo systemctl daemon-reload

        # if [ "$INTERNET_AVAILABLE" != "1" ]; then
        #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 stop multipaas-host-node' &>>$err_log
        #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 delete multipaas-host-node' &>>$err_log
        #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 save --force' &>>$err_log
        # else
        #     sudo -H -u multipaas bash -c 'pm2 stop multipaas-host-node' &>>$err_log
        #     sudo -H -u multipaas bash -c 'pm2 delete multipaas-host-node' &>>$err_log
        #     sudo -H -u multipaas bash -c 'pm2 save --force' &>>$err_log
        # fi
    fi

    if [ -f "/etc/systemd/system/multipaas-satelite.service" ]; then
        sudo systemctl stop multipaas-satelite.service
        sudo systemctl disable multipaas-satelite.service
        sudo rm -rf /etc/systemd/system/multipaas-satelite.service
        sudo systemctl daemon-reload
    fi

    if [ "$MASTER_IP" != "" ] && "$MPUS" != "" ] && [ "$MPPW" != "" ]; then
        MP_TOKEN=$(curl -s http://$MASTER_IP:3030/authentication/ \
            -H 'Content-Type: application/json' \
            --data-binary '{ "strategy": "local", "email": "'"$MPUS"'", "password": "'"$MPPW"'" }' | jq -r '.accessToken')
        if [ "$MP_TOKEN" != "null" ]; then
            if [ "$ACC_ID" != "" ] && [ "$IS_NEW_ACC" == "1" ]; then
                cp_api_delete "accounts/$ACC_ID"
            fi

            if [ "$ORG_ID" != "" ] && [ "$IS_NEW_ORG" == "0" ]; then
                cp_api_delete "organizations/$ORG_ID"
            fi

            if [ "$HOST_ID" != "" ]; then
                cp_api_delete "k8s_hosts/$HOST_ID"
            fi

            if [ "$U_ID" != "" ]; then
                cp_api_delete "users/$U_ID"
            fi
        fi
    fi
}

########################################
# 
########################################
configure_firewall() {
    if [ "$DISTRO" == "ubuntu" ]; then
        FW_INACTIVE=$(sudo ufw status verbose | grep "inactive")
        if [ "$FW_INACTIVE" == "" ]; then
            sudo ufw allow http
            sudo ufw allow https
        fi
    fi
    if [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
        if [[ `sudo firewall-cmd --state` = running ]]; then
            sudo firewall-cmd --zone=public --permanent --add-service=http
            sudo firewall-cmd --zone=public --permanent --add-service=https
            
            sudo firewall-cmd --permanent --add-port=3030/tcp
            sudo firewall-cmd --permanent --add-port=6443/tcp
            sudo firewall-cmd --permanent --add-port=2379-2380/tcp
            sudo firewall-cmd --permanent --add-port=10250/tcp
            sudo firewall-cmd --permanent --add-port=10251/tcp
            sudo firewall-cmd --permanent --add-port=10252/tcp
            sudo firewall-cmd --permanent --add-port=10255/tcp
            sudo firewall-cmd --reload
            sudo modprobe br_netfilter
        fi
    fi
}

########################################
# 
########################################

dependency_docker () {
    local  __resultvar=$1
    DK_EXISTS=$(command -v docker)
    dep_docker &>>$err_log &
    bussy_indicator "Dependency on \"Docker CE\"..."

    log "\n"
    if [ "$DK_EXISTS" == "" ]; then
        if [ "$DISTRO" == "redhat" ]; then
            sudo firewall-cmd --permanent --zone=trusted --add-interface=docker0 &>>$err_log
            sudo firewall-cmd --reload &>>$err_log
        fi
        eval $__resultvar="'1'"
    else
        # Make sure we have access to docher deamon
        DOCKER_USER_OK=$(groups | grep "docker")
        if [ "$DOCKER_USER_OK" == "" ]; then
            error "The current user does not have access to the docker deamon.\n"
            error "Did you restart your session afterhaving installed docker?\n"
            exit 1
        fi
    fi
}

dependency_node () {
    local  __resultvar=$1
    NODE_EXISTS=$(command -v node)
    dep_node &>>$err_log &
    bussy_indicator "Dependency on \"NodeJS\"..."

    log "\n"
    if [ "$NODE_EXISTS" == "" ]; then
        eval $__resultvar="'1'"
    fi
}

# dependency_pm2 () {
#     local  __resultvar=$1
#     PM2_EXISTS=$(command -v pm2)
#     dep_pm2 &>>$err_log &
#     bussy_indicator "Dependency on \"PM2\"..."

#     log "\n"
#     if [ "$PM2_EXISTS" == "" ]; then
#         eval $__resultvar="'1'"
#     fi
# }

dependencies_gluster () {
    sudo echo "" # Ask user for sudo password now
   
    if [ "$IS_K8S_NODE" != "true" ]; then
        dep_jq &>>$err_log &
        bussy_indicator "Dependency on \"jq\"..."
        log "\n"

        dep_gluster_client &>>$err_log &
        bussy_indicator "Dependency on \"gluster_client\"..."
        log "\n"

        if [ "$INTERNET_AVAILABLE" != "1" ]; then
            sudo docker load --input ../../build/offline_files/docker_images/node-12.16.2.tar &>>$err_log &
            bussy_indicator "Loading docker image node-12.16.2.tar..."
            log "\n"
        fi
    fi
    cd $_DIR
    if [ "$INTERNET_AVAILABLE" != "1" ]; then
        sudo docker load --input ../../build/offline_files/docker_images/gluster-centos-gluster4u0_centos7.tar &>>$err_log &
        bussy_indicator "Loading docker image gluster-centos-gluster4u0_centos7.tar..."
        log "\n"
    fi
}

dependencies_k8s () {
    sudo echo "" # Ask user for sudo password now

    dep_tar &>>$err_log &
    bussy_indicator "Dependency on \"tar\"..."
    log "\n"

    # dep_wget &>>$err_log &
    # bussy_indicator "Dependency on \"wget\"..."
    # log "\n"

    # dep_curl &>>$err_log &
    # bussy_indicator "Dependency on \"curl\"..."
    # log "\n"

    dep_kubernetes &>>$err_log &
    bussy_indicator "Dependency on \"Kubernetes\"..."
    log "\n"
    
    dep_jq &>>$err_log &
    bussy_indicator "Dependency on \"jq\"..."
    log "\n"

    dep_unzip &>>$err_log &
    bussy_indicator "Dependency on \"unzip\"..."
    log "\n"

    dep_gluster_client &>>$err_log &
    bussy_indicator "Dependency on \"gluster_client\"..."   
    log "\n"

    dep_mosquitto &>>$err_log &
    bussy_indicator "Dependency on \"mosquitto\"..."
    log "\n"

    dep_gitlab_runner &>>$err_log &
    bussy_indicator "Dependency on \"gitlab-runner\"..."
    log "\n"

    dep_helm &>>$err_log &
    bussy_indicator "Dependency on \"Helm\"..."
    log "\n"

    # Add sysctl settings
    sudo tee -a /etc/sysctl.d/kubernetes.conf >/dev/null <<'EOF'
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
EOF
    sudo sysctl --system &>>$err_log

    # Disable swap
    sudo sed -i '/swap/d' /etc/fstab &>>$err_log
    sudo swapoff -a &>>$err_log
}

load_docker_images() {
    sudo docker load --input ../../build/offline_files/docker_images/coredns-1.6.7.tar &>>$err_log &
    bussy_indicator "Loading docker image coredns-1.6.7.tar..."
    log "\n"

    sudo docker load --input ../../build/offline_files/docker_images/etcd-3.4.3-0.tar &>>$err_log &
    bussy_indicator "Loading docker image etcd-3.4.3-0.tar..."
    log "\n"

    sudo docker load --input ../../build/offline_files/docker_images/flannel-v0.12.0-amd64.tar &>>$err_log &
    bussy_indicator "Loading docker image flannel-v0.12.0-amd64.tar..."
    log "\n"

    sudo docker load --input ../../build/offline_files/docker_images/gitlab-runner-v12.10.1.tar &>>$err_log &
    bussy_indicator "Loading docker image gitlab-runner-v12.10.1.tar..."
    log "\n"

    # sudo docker load --input ../../build/offline_files/docker_images/kube-apiserver-*.tar &>>$err_log &
    # bussy_indicator "Loading docker image kube-apiserver-v1.18.3.tar..."
    # log "\n"

    # sudo docker load --input ../../build/offline_files/docker_images/kube-controller-manager-*.tar &>>$err_log &
    # bussy_indicator "Loading docker image kube-controller-manager-v1.18.3.tar..."
    # log "\n"

    # sudo docker load --input ../../build/offline_files/docker_images/kube-proxy-*.tar &>>$err_log &
    # bussy_indicator "Loading docker image kube-proxy-v1.18.3.tar..."
    # log "\n"

    # sudo docker load --input ../../build/offline_files/docker_images/kube-scheduler-*.tar &>>$err_log &
    # bussy_indicator "Loading docker image kube-scheduler-v1.18.3.tar..."
    # log "\n"

    sudo docker load --input ../../build/offline_files/docker_images/local-path-provisioner-v0.0.13.tar &>>$err_log &
    bussy_indicator "Loading docker image local-path-provisioner-v0.0.13.tar..."
    log "\n"

    sudo docker load --input ../../build/offline_files/docker_images/nginx-ingress-1.7.0.tar &>>$err_log &
    bussy_indicator "Loading docker image nginx-ingress-1.7.0.tar..."
    log "\n"

    sudo docker load --input ../../build/offline_files/docker_images/pause-3.2.tar &>>$err_log &
    bussy_indicator "Loading docker image pause-3.2.tar..."
    log "\n"

    sudo docker load --input ../../build/offline_files/docker_images/node-12.16.2.tar &>>$err_log &
    bussy_indicator "Loading docker image node-12.16.2.tar..."
    log "\n"

    cd ../../build/offline_files/docker_images
    FILES=( $(ls kube-*.*) )
    for i in "${FILES[@]}"
    do
        sudo docker load --input ./$i &>>$err_log &
        bussy_indicator "Loading docker image $i..."
        log "\n"
    done
    cd $_DIR

    # sudo docker load --input ../../build/offline_files/docker_images/cp-kafka-5.0.1.tar &>>$err_log &
    # bussy_indicator "Loading docker image cp-kafka-5.0.1.tar..."
    # log "\n"

    # sudo docker load --input ../../build/offline_files/docker_images/zookeeper-3.5.5.tar &>>$err_log &
    # bussy_indicator "Loading docker image zookeeper-3.5.5.tar..."
    # log "\n"

    # sudo docker load --input ../../build/offline_files/docker_images/eclipse-mosquitto-1.6.tar &>>$err_log &
    # bussy_indicator "Loading docker image eclipse-mosquitto-1.6.tar..."
    # log "\n"

    # sudo docker load --input ../../build/offline_files/docker_images/mongodb-4.2.5-debian-10-r44.tar &>>$err_log &
    # bussy_indicator "Loading docker image mongodb-4.2.5-debian-10-r44.tar..."
    # log "\n"

    # sudo docker load --input ../../build/offline_files/docker_images/busybox-1.29.3.tar &>>$err_log &
    # bussy_indicator "Loading docker image busybox-1.29.3.tar..."
    # log "\n"

    # sudo docker load --input ../../build/offline_files/docker_images/mysql-5.7.28.tar &>>$err_log &
    # bussy_indicator "Loading docker image mysql-5.7.28.tar..."
    # log "\n"

    # sudo docker load --input ../../build/offline_files/docker_images/node-red-1.0.1-12-minimal.tar &>>$err_log &
    # bussy_indicator "Loading docker image node-red-1.0.1-12-minimal.tar..."
    # log "\n"


    # sudo docker load --input ../../build/offline_files/docker_images/postgres-12.2-alpine.tar &>>$err_log &
    # bussy_indicator "Loading docker image postgres-12.2-alpine.tar..."
    # log "\n"

    # sudo docker load --input ../../build/offline_files/docker_images/redis-5.0.8-debian-10-r36.tar &>>$err_log &
    # bussy_indicator "Loading docker image redis-5.0.8-debian-10-r36.tar..."
    # log "\n"

    # if [ "$IS_GLUSTER_PEER" == "true" ]; then
    #     GLUSTER_IMG_EXISTS=$(docker images gluster/gluster-centos:gluster4u0_centos7 | sed -n '1!p')
    #     if [ "$GLUSTER_IMG_EXISTS" == "" ]; then
    #         sudo docker load --input ../../build/offline_files/docker_images/gluster-centos-gluster4u0_centos7.tar &>>$err_log &
    #         bussy_indicator "Loading docker image gluster-centos-gluster4u0_centos7.tar..."
    #         log "\n"
    #     fi
    # fi
}

########################################
# 
########################################
collect_gluster_informations() {
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

    if [ "${VALID_MOUNTS[$MOUNT_INDEX]}" == "/" ]; then
        BRICK_MOUNT_PATH="/bricks"
    else
        BRICK_MOUNT_PATH="${VALID_MOUNTS[$MOUNT_INDEX]}/bricks"
    fi
   
    GLUSTER_VOLUME="${VALID_MOUNTS[$MOUNT_INDEX]}"
}

collect_informations() {
    read_input "Enter the control-plane VM IP:" MASTER_IP 
    read_input "Enter the MultiPaaS sysadmin user email address:" MPUS
    read_input "Enter the MultiPaaS sysadmin user password:" MPPW

    get_network_interface_ip IFACE LOCAL_IP
    log "\n"
    curl --output /dev/null --silent --head --fail http://$MASTER_IP:3030
    if [ "$?" != "0" ]; then
        error "Control-plane API server is not responding.\n"
        error "Make sure the firewall is not blocking port 3030 on the control-plane.\n"
        exit 1
    fi

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

    sudo sed -i.bak '/multipaas.com/d' /etc/hosts &>>$err_log
    sudo rm -rf /etc/hosts.bak &>>$err_log
    sudo -- sh -c "echo $MASTER_IP multipaas.com multipaas.registry.com registry.multipaas.org multipaas.keycloak.com multipaas.gitlab.com multipaas.static.com >> /etc/hosts" &>>$err_log

    # Check preconditions
    if [ "$IS_K8S_NODE" == "true" ]; then
        log "\n"
        DEP_TARGET_LIST=("Kubernetes master" "Kubernetes worker")
        combo_value DEP_TARGET "What do you wish to install" "Your choice #:" "${DEP_TARGET_LIST[@]}"
        if [ "$DEP_TARGET" == "Kubernetes master" ]; then
            # Clean up first if necessary
            K8S_INSTALLED=$(docker ps -a | grep "k8s_kube-apiserver")
            if [ "$K8S_INSTALLED" != "" ]; then
                yes_no "Kubernetes is already running on this machine. Do you wish to reset this instances" REMOVE_K8S_RESPONSE
                if [ "$REMOVE_K8S_RESPONSE" == "y" ]; then
                    remove_all &>>$err_log &
                    bussy_indicator "Cleaning up..."
                    log "\n"
                    log "\n"
                else
                    exit 1
                fi
            fi
        fi

        # Make sure the registry certificates are installed
        if [ ! -f "/etc/docker/certs.d/registry.multipaas.org/ca.crt" ] && [ ! -f "$HOME/configPrivateRegistry.sh" ]; then
            error "Copy the Registry certificate setup script to your home folder:\n"
            warn " 1. Grab the config script from the control-plane\n"
            warn "    installation system (\$HOME/configPrivateRegistry.sh)\n"
            warn " 2. Place the script in the local home folder\n"
            CONDITION_FAIL="1"
        fi
        log "\n"
        if [ ! -f "$HOME/configNginxRootCA.sh" ]; then
            error "Copy the Nginx root certificate setup script to your home folder:\n"
            warn " 1. Grab the config script from the control-plane\n"
            warn "    installation system (\$HOME/configNginxRootCA.sh)\n"
            warn " 2. Place the script in the local home folder\n"
            CONDITION_FAIL="1"
        fi

        if [ "$CONDITION_FAIL" == "1" ]; then
            exit 0
        fi
    fi

    # Now Gluster
    if [ "$IS_GLUSTER_PEER" == "true" ]; then
        collect_gluster_informations
    fi
}

########################################
# 
########################################
setup_hostnode_service() {
    read -d '' HN_SYSTEMD_SCRIPT << EOF
#!/bin/sh
PATH="/usr/bin:$PATH"
export PATH
cd $_BASEDIR/src/host-node
node .
EOF
    create_node_system_service "multipaas-hostnode" "$HN_SYSTEMD_SCRIPT"  "multipaas"
}

########################################
# 
########################################
setup_satelite_service() {
    read -d '' ST_SYSTEMD_SCRIPT << EOF
#!/bin/sh
PATH="/usr/bin:$PATH"
export PATH
cd $_BASEDIR/src/satelite
node .
EOF
    create_node_system_service "multipaas-satelite" "$ST_SYSTEMD_SCRIPT"  "multipaas"
}

########################################
# 
########################################
install_master_core_components() {
    sudo -H -u multipaas bash -c "mkdir -p $MP_HOME/.multipaas"

    HOST_NODE_DEPLOYED=$(sudo ps aux | grep "[/]bin/sh /multipaas-hostnode.sh")
    if [ "$HOST_NODE_DEPLOYED" == "" ]; then
        cd $_BASEDIR/src/host-node/ # Position cmd in src folder

        cp env.template env

        VM_BASE=$MP_HOME/.multipaas/vm_base
        MULTIPAAS_CFG_DIR=$MP_HOME/.multipaas
        sed -i "s/<MP_MODE>/unipaas/g" ./env
        sed -i "s/<MASTER_IP>/$MASTER_IP/g" ./env
        sed -i "s/<DB_PORT>/5432/g" ./env
        sed -i "s/<DB_PASS>/$MPPW/g" ./env
        sed -i "s/<MOSQUITTO_PORT>/1883/g" ./env
        sed -i "s/<VM_BASE_HOME>/${VM_BASE//\//\\/}/g" ./env
        sed -i "s/<MULTIPAAS_CFG_DIR>/${MULTIPAAS_CFG_DIR//\//\\/}/g" ./env
        sed -i "s/<NET_INTEFACE>/$IFACE/g" ./env
        sed -i "s/<IS_K8S_NODE>/$IS_K8S_NODE/g" ./env
        sed -i "s/<IS_GLUSTER_PEER>/$IS_GLUSTER_PEER/g" ./env
        sed -i "s/<GLUSTER_VOL>/${GLUSTER_VOLUME//\//\\/}/g" ./env
        cp env .env
        rm env

        npm i
        setup_hostnode_service

        # if [ "$INTERNET_AVAILABLE" != "1" ]; then
        #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 -s start index.js --watch --name multipaas-host-node --time'
        #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 -s startup'
        #     sudo env PATH=$PATH:/usr/bin /opt/pm2/bin/pm2 startup systemd -u multipaas --hp $(eval echo ~multipaas) &>>$err_log
        #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 -s save --force'
        # else
        #     sudo -H -u multipaas bash -c 'pm2 -s start index.js --watch --name multipaas-host-node --time'
        #     sudo -H -u multipaas bash -c 'pm2 -s startup'
        #     sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u multipaas --hp $(eval echo ~multipaas)
        #     sudo -H -u multipaas bash -c 'pm2 -s save --force'
        #fi
    else
        if [ "$IS_GLUSTER_PEER" == "true" ]; then
            cd $_BASEDIR/src/host-node/ # Position cmd in src folder

            change_line "IS_GLUSTER_PEER" "IS_GLUSTER_PEER=true" ./.env
            change_line "GLUSTER_VOLUME" "GLUSTER_VOLUME=$GLUSTER_VOLUME" ./.env

            setup_hostnode_service

            # if [ "$INTERNET_AVAILABLE" != "1" ]; then
            #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 stop multipaas-host-node'
            #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 start multipaas-host-node'
            #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 -s save --force'
            # else
            #     sudo -H -u multipaas bash -c 'pm2 stop multipaas-host-node'
            #     sudo -H -u multipaas bash -c 'pm2 start multipaas-host-node'
            #     sudo -H -u multipaas bash -c 'pm2 -s save --force'
            # fi
        fi
    fi

    log "\n"
    
    # if [ "$INTERNET_AVAILABLE" != "1" ]; then
    #     HOST_NODE_SATELITE_DEPLOYED=$(sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 ls | grep "multipaas-satelite"')
    # else
    #     HOST_NODE_SATELITE_DEPLOYED=$(sudo -H -u multipaas bash -c 'pm2 ls | grep "multipaas-satelite"')
    # fi
    HOST_NODE_SATELITE_DEPLOYED=$(sudo ps aux | grep "[/]bin/sh /multipaas-satelite.sh")

    if [ "$HOST_NODE_SATELITE_DEPLOYED" == "" ]; then
        cd $_BASEDIR/src/satelite/ # Position cmd in src folder
        cp env.template env

        VM_BASE=$MP_HOME/.multipaas/vm_base
        MULTIPAAS_CFG_DIR=$MP_HOME/.multipaas
        sed -i "s/<MASTER_IP>/$MASTER_IP/g" ./env
        sed -i "s/<MOSQUITTO_PORT>/1883/g" ./env
        sed -i "s/<NET_INTEFACE>/$IFACE/g" ./env
        cp env .env
        rm env

        npm i
        setup_satelite_service

        # if [ "$INTERNET_AVAILABLE" != "1" ]; then
        #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 -s start index.js --watch --name multipaas-satelite --time'
        #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 -s startup'
        #     sudo env PATH=$PATH:/usr/bin /opt/pm2/bin/pm2 startup systemd -u multipaas --hp $(eval echo ~multipaas) &>>$err_log
        #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 -s save --force'
        # else
        #     sudo -H -u multipaas bash -c 'pm2 -s start index.js --watch --name multipaas-satelite --time'
        #     sudo -H -u multipaas bash -c 'pm2 -s startup'
        #     sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u multipaas --hp $(eval echo ~multipaas)
        #     sudo -H -u multipaas bash -c 'pm2 -s save --force'
        # fi
    fi
}

########################################
# 
########################################
install_satelite_core_components() {
    sudo -H -u multipaas bash -c "mkdir -p $MP_HOME/.multipaas"

    HOST_NODE_SATELITE_DEPLOYED=$(sudo ps aux | grep "[/]bin/sh /multipaas-satelite.sh")
    # if [ "$INTERNET_AVAILABLE" != "1" ]; then
    #     HOST_NODE_SATELITE_DEPLOYED=$(sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 ls | grep "multipaas-satelite"')
    # else
    #     HOST_NODE_SATELITE_DEPLOYED=$(sudo -H -u multipaas bash -c 'pm2 ls | grep "multipaas-satelite"')
    # fi

    if [ "$HOST_NODE_SATELITE_DEPLOYED" == "" ]; then
        cd $_BASEDIR/src/satelite/ # Position cmd in src folder

        cp env.template env

        VM_BASE=$MP_HOME/.multipaas/vm_base
        MULTIPAAS_CFG_DIR=$MP_HOME/.multipaas
        sed -i "s/<MASTER_IP>/$MASTER_IP/g" ./env
        sed -i "s/<MOSQUITTO_PORT>/1883/g" ./env
        sed -i "s/<NET_INTEFACE>/$IFACE/g" ./env
        cp env .env
        rm env

        npm i
        setup_satelite_service
        # if [ "$INTERNET_AVAILABLE" != "1" ]; then
        #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 -s start index.js --watch --name multipaas-satelite --time'
        #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 -s startup'
        #     sudo env PATH=$PATH:/usr/bin /opt/pm2/bin/pm2 startup systemd -u $USER --hp $(eval echo ~$USER) &>>$err_log
        #     sudo -H -u multipaas bash -c '/opt/pm2/bin/pm2 -s save --force'
        # else
        #     sudo -H -u multipaas bash -c 'pm2 -s start index.js --watch --name multipaas-satelite --time'
        #     sudo -H -u multipaas bash -c 'pm2 -s startup'
        #     # sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $(eval echo ~$USER) &>>$err_log
        #     sudo -H -u multipaas bash -c 'pm2 -s save --force'
        # fi
    fi
}

registry_auth() {
    # sshpass -p 'vagrant' scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no vagrant@$MASTER_IP:/home/vagrant/configPrivateRegistry.sh $MP_HOME/configPrivateRegistry.sh &>/dev/null
    sudo chmod +x $HOME/configPrivateRegistry.sh
    sudo /bin/bash $HOME/configPrivateRegistry.sh

    _RCOUNTER=0
    while :
    do
        printf "$RP" | docker login registry.multipaas.org --username $RU --password-stdin
        if [ "$?" == "0" ]; then
            break
        else
            _RCOUNTER=$((_RCOUNTER+1))
            if [ "$_RCOUNTER" -eq "5" ];then
                error "Could not connect to the docker registry"
                exit 1
            fi
        fi
    done
}

create_master_services() {
    # ==> Enable k8s deployment logger
    sudo tee -a /multipaas-tail-deployment-events.sh >/dev/null <<'EOF'
#!/bin/bash
cluster_event_logger() {
    while read IN
    do
        LWC=$(echo "$IN" | awk '{print tolower($0)}')
        mosquitto_pub -h <MQTT_IP> -t /multipaas/cluster/event/$HOSTNAME -m "D:$LWC"
    done
}
while :
do
	kubectl --kubeconfig <HOME>/.kube/admin.conf get deployments --all-namespaces --watch -o wide 2>&1 | cluster_event_logger
	sleep 1
done
EOF
    sudo chmod a+wx /multipaas-tail-deployment-events.sh
    sudo sed -i "s/<MQTT_IP>/$MASTER_IP/g" /multipaas-tail-deployment-events.sh
    sudo sed -i "s/<HOME>/${HOME//\//\\/}/g" /multipaas-tail-deployment-events.sh
    # Build & Start service
    read -d '' DEP_SRV_SCRIPT << EOF
#!/bin/bash
. /multipaas-tail-deployment-events.sh
EOF
    create_system_service "multipaas-events-dep" "$DEP_SRV_SCRIPT" "simple" "$USER"

    # ==> Enable k8s statefulset logger
    sudo tee -a /multipaas-tail-statefulset-events.sh >/dev/null <<'EOF'
#!/bin/bash
cluster_event_logger() {
    while read IN
    do
        LWC=$(echo "$IN" | awk '{print tolower($0)}')
        mosquitto_pub -h <MQTT_IP> -t /multipaas/cluster/event/$HOSTNAME -m "S:$LWC"
    done
}
while :
do
	kubectl --kubeconfig <HOME>/.kube/admin.conf get statefulsets --all-namespaces --watch -o wide 2>&1 | cluster_event_logger
	sleep 1
done
EOF
    sudo chmod a+wx /multipaas-tail-statefulset-events.sh
    sudo sed -i "s/<MQTT_IP>/$MASTER_IP/g" /multipaas-tail-statefulset-events.sh
    sudo sed -i "s/<HOME>/${HOME//\//\\/}/g" /multipaas-tail-statefulset-events.sh
    # Build & Start service
    read -d '' STS_SRV_SCRIPT << EOF
#!/bin/bash
. /multipaas-tail-statefulset-events.sh
EOF
    create_system_service "multipaas-events-stfset" "$STS_SRV_SCRIPT" "simple" "$USER"
}

########################################
# 
########################################
init_k8s_master() { 
    cd $_BASEDIR
   
    sudo rm -rf /etc/default/kubelet

    sudo tee -a /etc/default/kubelet >/dev/null <<EOF
KUBELET_EXTRA_ARGS=--node-ip=$LOCAL_IP
EOF

    sudo systemctl enable kubelet 
    sudo systemctl start kubelet 

    sudo kubeadm init --apiserver-advertise-address=$LOCAL_IP --pod-network-cidr=10.244.0.0/16 --ignore-preflight-errors=NumCPU

    cat <<'EOT' >> $HOME/gentoken.sh
#!/bin/bash
IN="$(kubeadm token create --print-join-command 2>/dev/null)"
IFS=' ' read -r -a array <<< "$IN"
echo "${array[4]} ${array[6]}"
EOT
    sudo chmod +x $HOME/gentoken.sh
    
    mkdir -p $HOME/.kube

    rm -rf $HOME/.kube/config
    sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
    sudo chown $(id -u):$(id -g) $HOME/.kube/config

    rm -rf $HOME/.kube/admin.conf
    sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/admin.conf
    sudo chown $(id -u):$(id -g) $HOME/.kube/admin.conf

    echo "export KUBECONFIG=$HOME/.kube/admin.conf" | tee -a $HOME/.bashrc
    export KUBECONFIG=$HOME/.kube/admin.conf


    sudo -H -u multipaas bash -c "mkdir -p $MP_HOME/.kube"

    sudo -H -u multipaas bash -c "rm -rf $MP_HOME/.kube/config"
    sudo cp -i /etc/kubernetes/admin.conf $MP_HOME/.kube/config
    sudo chown multipaas:multipaas $MP_HOME/.kube/config

    rm -rf $MP_HOME/.kube/admin.conf
    sudo cp -i /etc/kubernetes/admin.conf $MP_HOME/.kube/admin.conf
    sudo chown multipaas:multipaas $MP_HOME/.kube/admin.conf

    echo "export KUBECONFIG=$HOME/.kube/admin.conf" | tee -a $MP_HOME/.bashrc

    sleep 5

    # Untaint master
    kubectl taint nodes --all node-role.kubernetes.io/master-

    # Enable PodPresets
    sudo sed -i "s/enable-admission-plugins=NodeRestriction/enable-admission-plugins=NodeRestriction,PodPreset/g" /etc/kubernetes/manifests/kube-apiserver.yaml
    sudo sed -i '/- kube-apiserver/a\ \ \ \ - --runtime-config=settings.k8s.io/v1alpha1=true' /etc/kubernetes/manifests/kube-apiserver.yaml

    sleep 10 # Give kubeadm the time to restart with new config

    # Deploy flannel network
    kubectl apply -f ./src/host-node/resources/k8s_templates/kube-flannel.yml

    # Install ingress & local provisioner
    kubectl apply -f ./src/host-node/resources/k8s_templates/ingress-controller/common/ns-and-sa.yaml
    kubectl apply -f ./src/host-node/resources/k8s_templates/ingress-controller/rbac/rbac.yaml
    kubectl apply -f ./src/host-node/resources/k8s_templates/ingress-controller/common/default-server-secret.yaml
    kubectl apply -f ./src/host-node/resources/k8s_templates/ingress-controller/common/nginx-config.yaml
    kubectl apply -f ./src/host-node/resources/k8s_templates/ingress-controller/common/vs-definition.yaml
    kubectl apply -f ./src/host-node/resources/k8s_templates/ingress-controller/common/vsr-definition.yaml
    kubectl apply -f ./src/host-node/resources/k8s_templates/ingress-controller/common/ts-definition.yaml
    kubectl apply -f ./src/host-node/resources/k8s_templates/ingress-controller/common/gc-definition.yaml
    kubectl apply -f ./src/host-node/resources/k8s_templates/ingress-controller/common/global-configuration.yaml
    kubectl apply -f ./src/host-node/resources/k8s_templates/ingress-controller/daemon-set/nginx-ingress.yaml

    kubectl apply -f ./src/host-node/resources/k8s_templates/local-path-provisioner/local-path-storage.yaml

    

    # Configure OpenID Connect for Keycloak
    sudo rm -rf /etc/kubernetes/pki/rootCA.crt

    # sshpass -p 'vagrant' scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no vagrant@$MASTER_IP:/home/vagrant/configNginxRootCA.sh $MP_HOME/configNginxRootCA.sh &>/dev/null
    sudo chmod +x $HOME/configNginxRootCA.sh
    sudo /bin/bash $HOME/configNginxRootCA.sh

    sudo sed -i '/- kube-apiserver/a\ \ \ \ - --oidc-issuer-url=https://multipaas.keycloak.com/auth/realms/master' /etc/kubernetes/manifests/kube-apiserver.yaml
    sudo sed -i '/- kube-apiserver/a\ \ \ \ - --oidc-groups-claim=groups' /etc/kubernetes/manifests/kube-apiserver.yaml
    sudo sed -i '/- kube-apiserver/a\ \ \ \ - --oidc-username-claim=email' /etc/kubernetes/manifests/kube-apiserver.yaml
    sudo sed -i '/- kube-apiserver/a\ \ \ \ - --oidc-client-id=kubernetes-cluster' /etc/kubernetes/manifests/kube-apiserver.yaml
    sudo sed -i '/- kube-apiserver/a\ \ \ \ - --oidc-ca-file=/etc/kubernetes/pki/rootCA.crt' /etc/kubernetes/manifests/kube-apiserver.yaml

    sudo $HOME/gentoken.sh
}

########################################
# 
########################################
init_k8s_worker() { 
    cd $_BASEDIR
   
    cat <<EOT > $HOME/config_kublet_ip.sh
#!/bin/bash
sed -i "s/--network-plugin=cni/--network-plugin=cni --node-ip=$LOCAL_IP/g" /var/lib/kubelet/kubeadm-flags.env
EOT
    chmod +x $HOME/config_kublet_ip.sh
    log "\n"

    read_input "K8S Master IP:" K8S_MASTER_IP
    warn "Execute the script \$HOME/gentoken.sh on the master node, and enter the generated token here\n"
    read_input "TOKEN:" K8S_JOIN_TOKEN
    log "\n"
    IFS=' ' read -r -a tokens <<< "$K8S_JOIN_TOKEN"

    sudo kubeadm join $K8S_MASTER_IP:6443 --token ${tokens[0]} --discovery-token-ca-cert-hash ${tokens[1]} &>>$err_log
    if [ "$?" != "0" ]; then
        error "Could not join the cluster"
        exit 1
    fi
    sudo bash $HOME/config_kublet_ip.sh

    sudo chmod +x $HOME/configNginxRootCA.sh
    sudo /bin/bash $HOME/configNginxRootCA.sh
}

cp_api_auth() {
    MP_TOKEN=$(curl -s http://$MASTER_IP:3030/authentication/ \
        -H 'Content-Type: application/json' \
        --data-binary '{ "strategy": "local", "email": "'"$1"'", "password": "'"$2"'" }' | jq -r '.accessToken')
    if [ "$MP_TOKEN" == "null" ]; then
        error "MultiPaaS authentication failed\n"
        exit 1
    fi
}

cp_api_get() {
    local  __resultvar=$1
    local _R=$(curl -s -k \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $MP_TOKEN" \
        -X GET \
        http://$MASTER_IP:3030/$2)
    eval $__resultvar="'$_R'"
}

cp_api_create() {
    local  __resultvar=$1
    local _R=$(curl -s -k \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $MP_TOKEN" \
        -X POST \
        -d $3 \
        http://$MASTER_IP:3030/$2)
    eval $__resultvar="'$_R'"
}

cp_api_delete() {
    local  __resultvar=$1
    local _R=$(curl -s -k \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $MP_TOKEN" \
        -X DELETE \
        http://$MASTER_IP:3030/$1)
    eval $__resultvar="'$_R'"
}

declare_worker_node() {
    cp_api_auth "$MPUS" "$MPPW"

    # Make sure hostname is not in use
    HNAME=$(hostname)
    cp_api_get EXISTING_HOST "k8s_hosts?hostname=$HNAME"
    if [ "$(echo "$EXISTING_HOST" | jq -r '.total')" == "1" ]; then
        error "This machine hostname $HNAME is already in use."
        exit 1
    fi

    cp_api_get EXISTING_MASTER_NODE "k8s_nodes?ip=$K8S_MASTER_IP&nodeType=MASTER"
    WS_ID=$(echo "$EXISTING_MASTER_NODE" | jq -r '.data[0].workspaceId')

    # Create workspace base folder
    sudo -H -u multipaas bash -c "mkdir -p $MP_HOME/.multipaas/vm_base/workplaces/$WS_ID/$HNAME"

    # Host
    J_PAYLOAD='{"workspaceId":'"$WS_ID"',"ip":"'"$LOCAL_IP"'","hostname":"'"$HNAME"'","status":"ready"}'
    cp_api_create HOST_CR_RESP "k8s_hosts" $J_PAYLOAD
    HOST_ID=$(echo "$HOST_CR_RESP" | jq -r '.id')
    MASTER_UUID=$(echo "$HOST_CR_RESP" | jq -r '.hash')

    J_PAYLOAD='{"workspaceId":'"$WS_ID"',"k8sHostId":'"$HOST_ID"',"ip":"'"$LOCAL_IP"'","hostname":"'"$HNAME"'","hash":"'"$MASTER_UUID"'","nodeType":"WORKER"}'
    cp_api_create NODE_CR_RESP "k8s_nodes" $J_PAYLOAD
}

create_account_and_register() {
    warn "Before you can start using your cluster, you need to register this node with the control-plane"
    log "\n"

    cp_api_auth "$MPUS" "$MPPW"

    # Make sure hostname is not in use
    HNAME=$(hostname)
    cp_api_get EXISTING_HOST "k8s_hosts?hostname=$HNAME"
    if [ "$(echo "$EXISTING_HOST" | jq -r '.total')" == "1" ]; then
        error "This machine hostname $HNAME is already in use."
        exit 1
    fi

    # Account
    VALIDE="0"
    IS_NEW_ACC="0"
    while [[ "$VALIDE" == '0' ]]; do
        read_input "Enter an account name:" ACC_NAME
        cp_api_get EXISTING_ACC "accounts?name=$ACC_NAME"
        if [ "$(echo "$EXISTING_ACC" | jq -r '.total')" == "1" ]; then
            yes_no "Account exists. Do you want to use the existing account $ACC_NAME" _RESPONSE
            if [ "$_RESPONSE" == "y" ]; then
                ACC_ID=$(echo "$EXISTING_ACC" | jq -r '.data[0].id')
                VALIDE="1"
            fi

            # User email & password
            VALIDE='0'
            while [[ "$VALIDE" == '0' ]]; do
                read_input "Enter the cluster account user email address:" UPUS
                cp_api_get EXISTING_USER "users?email=$UPUS"

                if [ "$(echo "$EXISTING_USER" | jq -r '.total')" == "1" ]; then
                    error "User name already in use.\n"
                else
                    VALIDE="1"
                fi
            done
        else
            IS_NEW_ACC="1"
            # User email & password
            VALIDE='0'
            while [[ "$VALIDE" == '0' ]]; do
                read_input "Enter the cluster account user email address:" UPUS
                cp_api_get EXISTING_USER "users?email=$UPUS"

                if [ "$(echo "$EXISTING_USER" | jq -r '.total')" == "1" ]; then
                    error "User name already in use.\n"
                else
                    VALIDE="1"
                fi
            done

            read_input "Enter the cluster account user password:" UPPW

            # super...
            J_PAYLOAD='{"action":"account","params":{"accountName":"'"$ACC_NAME"'","email":"'"$UPUS"'","password":"'"$UPPW"'"}}'
            cp_api_create ACC_CR_RESP "cli" $J_PAYLOAD
            if [ "$(echo "$ACC_CR_RESP" | jq -r '.code')" != "200" ]; then
                error "An error occured, could not create account\n"
                exit 1
            else
                cp_api_get EXISTING_ACC "accounts?name=$ACC_NAME"
                ACC_ID=$(echo "$EXISTING_ACC" | jq -r '.data[0].id')
                VALIDE="1"
                U_ID=$(echo "$EXISTING_USER" | jq -r '.data[0].id')
            fi
        fi
    done

    cp_api_auth "$UPUS" "$UPPW"

    # Organization
    VALIDE='0'
    IS_NEW_ORG="0"
    while [[ "$VALIDE" == '0' ]]; do
        read_input "Enter an organization name:" ORG_NAME
        cp_api_get EXISTING_ORG "organizations?name=$ORG_NAME&accountId=$ACC_ID"
        if [ "$(echo "$EXISTING_ORG" | jq -r '.total')" == "1" ]; then
            yes_no "Organization exists. Do you want to use the existing organization $ORG_NAME" _RESPONSE
            if [ "$_RESPONSE" == "y" ]; then
                ORG_ID=$(echo "$EXISTING_ORG" | jq -r '.data[0].id')

                read_input "Enter the organization registry username:" RU
                read_input "Enter the organization registry password:" RP

                VALIDE="1"
            fi
        else
            IS_NEW_ORG="1"
            # Registry credentials
            read_input "Enter the organization registry username:" RU
            read_input "Enter the organization registry password:" RP

            # super...
            J_PAYLOAD='{"accountId":'"$ACC_ID"',"name":"'"$ORG_NAME"'","registryUser":"'"$RU"'","registryPass":"'"$RP"'"}'
            cp_api_create ORG_CR_RESP "organizations" $J_PAYLOAD
            if [ "$(echo "$ORG_CR_RESP" | jq -r '.code')" != "200" ]; then
                error "An error occured, could not create organization\n"
                exit 1
            else
                ORG_ID=$(echo "$ORG_CR_RESP" | jq -r '.data.organization.id')
                VALIDE="1"
            fi
        fi
    done

    # Workspace
    VALIDE='0'
    while [[ "$VALIDE" == '0' ]]; do
        read_input "Enter a cluster name:" WS_NAME
        cp_api_get EXISTING_WS "workspaces?name=$WS_NAME&organizationId=$ORG_ID"
        if [ "$(echo "$EXISTING_WS" | jq -r '.total')" == "1" ]; then
            error "The workspace name $WS_NAME is already taken.\n"
        else
            J_PAYLOAD='{"organizationId":'"$ORG_ID"',"name":"'"$WS_NAME"'"}'
            cp_api_create WS_CR_RESP "workspaces" $J_PAYLOAD
            if [ "$(echo "$WS_CR_RESP" | jq -r '.code')" != "200" ]; then
                error "An error occured, could not create workspace\n"
                exit 1
            else
                WS_ID=$(echo "$WS_CR_RESP" | jq -r '.data.id')
                VALIDE="1"
            fi
        fi
    done

    # Create workspace base folder
    sudo -H -u multipaas bash -c "mkdir -p $MP_HOME/.multipaas/vm_base/workplaces/$WS_ID/$HNAME"

    # Host
    J_PAYLOAD='{"workspaceId":'"$WS_ID"',"ip":"'"$LOCAL_IP"'","hostname":"'"$HNAME"'","status":"ready"}'
    cp_api_create HOST_CR_RESP "k8s_hosts" $J_PAYLOAD
    HOST_ID=$(echo "$HOST_CR_RESP" | jq -r '.id')
 
    # Node
    NEW_UUID=$(openssl rand -hex 12 | head -c 8 ; echo)

    J_PAYLOAD='{"workspaceId":'"$WS_ID"',"k8sHostId":'"$HOST_ID"',"ip":"'"$LOCAL_IP"'","hostname":"'"$HNAME"'","hash":"'"$NEW_UUID"'","nodeType":"MASTER"}'
    cp_api_create NODE_CR_RESP "k8s_nodes" $J_PAYLOAD
}

create_registry_secret() {
    source $HOME/.bashrc
    export KUBECONFIG=$HOME/.kube/admin.conf

    z=0
    local ALL_GOOD="0"
    while [[ $z -lt 10 ]]
    do
        ((z++))
        kubectl create secret docker-registry regcred --docker-server=registry.multipaas.org --docker-username=$RU --docker-password=$RP --docker-email=multipaas@multipaas.com
        if [[ "$?" == "0" ]]; then
            ALL_GOOD="1"
            break
        else
            sleep 6
        fi
    done

    if [ "$ALL_GOOD" == "0" ]; then
        echo "Could not create registry secret"
        exit 1
    fi
}

multipaas_user() {
    id -u multipaas &>/dev/null
    if [ "$?" != "0" ]; then
        read_input "A user called 'multipaas' with sudo privileges will be created on this system. Please provide a password for this user now:" MP_LINUX_USER

        if [ "$DISTRO" == "ubuntu" ]; then
            sudo adduser multipaas --gecos "MultiPaas,NA,NA,NA" --disabled-password &>>$err_log
            echo "multipaas:$MP_LINUX_USER" | sudo chpasswd &>>$err_log
            sudo usermod -aG sudo multipaas &>>$err_log
        elif [ "$DISTRO" == "redhat" ]; then
            PWORD=$(perl -e 'print crypt("multipaas", "salt"),"\n"')
            sudo useradd -m -p $PWORD multipaas
            sudo usermod -aG wheel multipaas
        fi
        sudo tee -a /etc/sudoers >/dev/null <<'EOF'
multipaas ALL=(ALL) NOPASSWD: ALL
EOF
    fi
    MP_HOME=/home/multipaas

    # add multipaas user do docker group is not already
    if [ "$(command -v docker)" != "" ]; then
        if [ "$(sudo su -c "groups" multipaas | grep "docker")" == "" ]; then
            sudo usermod -aG docker multipaas
        fi
    fi
}

apply_repo_permissions() {
    ALL_PARENTS=()
    RECURS_FLD="$_BASEDIR"
    ALL_PARENTS+=($RECURS_FLD)
    KEEP_DIGGING='1'
    while [ "$KEEP_DIGGING" == '1' ]; do
        RECURS_FLD="$(dirname "$RECURS_FLD")"
        if [ "$RECURS_FLD" == "/" ]; then
            KEEP_DIGGING='0'
        else
            ALL_PARENTS+=($RECURS_FLD)
        fi
    done

    for _folder in "${ALL_PARENTS[@]}"; do :
        sudo -u multipaas ls $_folder &>/dev/null
        if [ "$?" != "0" ]; then
            sudo setfacl -m u:multipaas:rx $_folder
        fi
    done
    sudo setfacl -R -m u:multipaas:rx $_BASEDIR
}

########################################
# LOGIC...
########################################
# trap 'on_exit $? $LINENO' EXIT

/usr/bin/clear

base64 -d <<<"ICAgXyAgICBfICAgICAgIF8gX19fX18gICAgICAgICAgICAgX19fX18gICBfX19fXyAgICAgICAgICAgXyAgICAgICAgXyBfICAgICAgICAgICAKICB8IHwgIHwgfCAgICAgKF8pICBfXyBcICAgICAgICAgICAvIF9fX198IHxfICAgX3wgICAgICAgICB8IHwgICAgICB8IHwgfCAgICAgICAgICAKICB8IHwgIHwgfF8gX18gIF98IHxfXykgfF8gXyAgX18gX3wgKF9fXyAgICAgfCB8ICBfIF9fICBfX198IHxfIF9fIF98IHwgfCBfX18gXyBfXyAKICB8IHwgIHwgfCAnXyBcfCB8ICBfX18vIF9gIHwvIF9gIHxcX19fIFwgICAgfCB8IHwgJ18gXC8gX198IF9fLyBfYCB8IHwgfC8gXyBcICdfX3wKICB8IHxfX3wgfCB8IHwgfCB8IHwgIHwgKF98IHwgKF98IHxfX19fKSB8ICBffCB8X3wgfCB8IFxfXyBcIHx8IChffCB8IHwgfCAgX18vIHwgICAKICAgXF9fX18vfF98IHxffF98X3wgICBcX18sX3xcX18sX3xfX19fXy8gIHxfX19fX3xffCB8X3xfX18vXF9fXF9fLF98X3xffFxfX198X3wgICAg"
log "\n\n"

# Figure out what distro we are running
distro

# Make sure we have enougth resources
min_mem "5800000"
min_avail_hd

log "==> This script will install the MultiPaaS host-node and it's dependencies on this machine.\n"
log "\n"
yes_no "Do you wish to continue" CONTINUE_INSTALL
if [ "$CONTINUE_INSTALL" == "n" ]; then
    exit 0
fi

sudo echo ""

# Create multipaas user
multipaas_user

# Give multipaas user permissions to this folder
apply_repo_permissions

# Test and see if internet access is available
wget -q --spider http://google.com &>>$err_log
if [ $? -eq 0 ]; then
    INTERNET_AVAILABLE=1
fi

if [ "$INTERNET_AVAILABLE" != "1" ]; then
    . ../../_libs/dep_offline.sh

    GIT_EXISTS=$(command -v git)
    if [ "$GIT_EXISTS" == "" ]; then
        log "\n"
        error "==> Gitlab-runner requires Git to be installed on this machine. Please install Git first, then run this script again.\n"
        exit 1
    fi

    if [ "$DISTRO" == "ubuntu" ] && [ "$MAJ_V" == "18.04" ]; then
        PK_FOLDER_NAME="ubuntu_bionic"
    else
        echo "Unsupported OS. This script only works on Ubuntu 18.04 & RedHat 7"
        exit 1
    fi
else
    . ../../_libs/dep_online.sh

    if [ "$DISTRO" == "ubuntu" ] && [ "$MAJ_V" == "18.04" ]; then
        curl -s -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash &>>$err_log &
        bussy_indicator "Adding gitlab-runner repo..."
        log "\n"
    elif [ "$DISTRO" == "redhat" ] && [ "$MAJ_V" == "7" ]; then
        log "Enabeling repos...\n"

        EPEL_REPO_PRESENT=$(yum repolist epel | grep "Extra Packages for Enterprise Linux 7")
        if [ "$EPEL_REPO_PRESENT" == "" ]; then
            log "\n"
            sudo yum -y install https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm &>>$err_log &
            bussy_indicator "Adding EPEL repo..."
            log "\n"
        fi

        RUNNER_REPO_PRESENT=$(yum repolist runner_gitlab-runner | grep "runner_gitlab-runner/x86_64")
        if [ "$RUNNER_REPO_PRESENT" == "" ]; then
            curl -s -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.rpm.sh | sudo bash &>>$err_log &
            bussy_indicator "Adding gitlab-runner repo..."
            log "\n"
        fi

        RH7EXTRA_REPO_PRESENT=$(yum repolist "Red Hat Enterprise Linux 7 Server - Extras (RPMs)" | grep "rhel-7-server-extras-rpms/x86_64")
        if [ "$RH7EXTRA_REPO_PRESENT" == "" ]; then
            sudo subscription-manager repos --enable=rhel-7-server-extras-rpms &>>$err_log &
            bussy_indicator "Adding extra repo subscription..."
            log "\n"
        fi

        DOCKER_REPO_PRESENT=$(yum repolist "Docker CE Stable - x86_64" | grep "docker-ce-stable/x86_64")
        if [ "$DOCKER_REPO_PRESENT" == "" ]; then
            sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo &>>$err_log &
            bussy_indicator "Adding Docker repo..."
            log "\n"
        fi

        if [ ! -f "/etc/yum.repos.d/Gluster.repo" ]; then
            sudo tee -a /etc/yum.repos.d/Gluster.repo >/dev/null <<'EOF'
[gluster38]
name=Gluster 3.8
baseurl=http://mirror.centos.org/centos/7/storage/x86_64/gluster-7/
gpgcheck=0
enabled=1
EOF
        fi
        
        sudo yum update -y &>>$err_log &
        bussy_indicator "Updating repos..."
        log "\n"

        sudo yum install epel-release -y &>>$err_log &
        bussy_indicator "Installing epel-release..."
        log "\n"
    else
        echo "Unsupported OS. This script only works on Ubuntu 18.04 and RedHat 7"
        exit 1
    fi
fi

# Firewall rules
configure_firewall &>>$err_log &
bussy_indicator "Configuring firewall..."
log "\n"

# Install docker & NodeJS first
dependency_docker NEED_DK_RESTART
dependency_node NEED_NODE_RESTART
# dependency_pm2 NEED_PM2_RESTART
if [ "$INTERNET_AVAILABLE" != "1" ]; then
    if [ "$NEED_DK_RESTART" == "1" ] || [ "$NEED_NODE_RESTART" == "1" ]; then
        log "\n"
        warn "==> Docker and/or NodeJS was just installed, you will have to restart your session before starting the cluster-ctl container. Please log out, and log back in, then execute this script again.\n"
        exit 0
    fi
else
    if [ "$NEED_DK_RESTART" == "1" ]; then
        log "\n"
        warn "==> Docker was just installed, you will have to restart your session before starting the cluster-ctl container. Please log out, and log back in, then execute this script again.\n"
        exit 0
    fi
fi

log "\n" 
# Collect info from user
collect_informations

# Now install
if [ "$IS_K8S_NODE" == "true" ]; then
    # Install dependencies_k8s
    dependencies_k8s

    if [ "$INTERNET_AVAILABLE" != "1" ]; then
        load_docker_images
    fi

    if [ "$DEP_TARGET" == "Kubernetes master" ]; then
        # Install the core components
        install_master_core_components &>>$err_log &
        bussy_indicator "Installing host controller components..."
        log "\n"

        init_k8s_master &>>$err_log &
        bussy_indicator "Installing kubernetes cluster master..."
        log "\n"
        log "\n"

        # Register node
        create_account_and_register
        
        # Authenticate to registry
        registry_auth &>>$err_log &
        bussy_indicator "Configure k8s registry credentials..."
        log "\n"

        # Configure registry with the cluster
        sleep 20 &>>$err_log &
        bussy_indicator "Waiting for cluster to become available again..."
        log "\n"

        create_registry_secret &>>$err_log &
        bussy_indicator "Create registry secret on cluster..."
        log "\n"

        # Now create background services
        create_master_services >/dev/null 2>&1
        
        log "\n"

        success "MultiPaaS host controller & K8S master deployed successfully!\n"
        log "\n"
    else
        # Install the core components
        install_satelite_core_components &>>$err_log &
        bussy_indicator "Installing host controller components..."
        log "\n"

        init_k8s_worker
    
        # Register node
        declare_worker_node
        
        # Authenticate to registry
        read_input "Enter the organization registry username that the target cluster belongs to:" RU
        read_input "Enter the organization registry password:" RP
        registry_auth &>>$err_log &
        bussy_indicator "Configure k8s registry credentials..."
        log "\n"

        success "MultiPaaS host controller & K8S worker deployed successfully!\n"
        log "\n"
    fi
fi

# Now Gluster
if [ "$IS_GLUSTER_PEER" == "true" ]; then
    GLUSTER_INSTALLED=$(docker ps -a | grep "gluster-ctl")
    if [ "$GLUSTER_INSTALLED" != "" ]; then
        warn "The gluster controller is already running on this machine.\n"
    else
        dependencies_gluster

        sudo -H -u multipaas bash -c "mkdir -p $MP_HOME/.multipaas/gluster/etc/glusterfs" 2>&1 | log_error_sanitizer
        sudo -H -u multipaas bash -c "mkdir -p $MP_HOME/.multipaas/gluster/var/lib/glusterd" 2>&1 | log_error_sanitizer
        sudo -H -u multipaas bash -c "mkdir -p $MP_HOME/.multipaas/gluster/var/log/glusterfs" 2>&1 | log_error_sanitizer
        sudo mkdir -p $BRICK_MOUNT_PATH 2>&1 | log_error_sanitizer

        docker rm -f gluster-ctl >/dev/null 2>&1
        docker run \
            -d --privileged=true \
            --restart unless-stopped \
            --net=host -v /dev/:/dev \
            -v $MP_HOME/.multipaas/gluster/etc/glusterfs:/etc/glusterfs:z \
            -v $MP_HOME/.multipaas/gluster/var/lib/glusterd:/var/lib/glusterd:z \
            -v $MP_HOME/.multipaas/gluster/var/log/glusterfs:/var/log/glusterfs:z \
            -v $BRICK_MOUNT_PATH:/bricks:z \
            -v /sys/fs/cgroup:/sys/fs/cgroup:ro \
            --name gluster-ctl \
            gluster/gluster-centos:gluster4u0_centos7 &>/dev/null

        log "\n"

        if [ "$IS_K8S_NODE" != "true" ] || [ "$DEP_TARGET" != "Kubernetes master" ]; then
            install_master_core_components &>>$err_log &
            bussy_indicator "Reconfiguring host controller components..."
            log "\n"
        fi

        # Gluster Host
        HNAME=$(hostname)
        cp_api_auth "$MPUS" "$MPPW"
        J_PAYLOAD='{"ip":"'"$LOCAL_IP"'","hostname":"'"$HNAME"'","status":"ready"}'
        cp_api_create HOST_GLUSTER_RESP "gluster-hosts" $J_PAYLOAD
        
        # Join the gluster network
        log "\n"
        warn "==> To add this Gluster peer to the Gluster network, execute the following command ON ANY OTHER GLUSTER peer host:\n"
        warn "    PLEASE NOTE: This is only necessary if this is NOT the first Gluster node for this Gluster network\n"
        log "\n"
        log "    docker exec gluster-ctl gluster peer probe $LOCAL_IP \n"
    fi
fi

cd "$_PWD"
