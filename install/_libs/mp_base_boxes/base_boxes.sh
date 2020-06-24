#!/bin/bash

########################################
# 
########################################
build_base_box() {
    cd $_DIR
    cd k8s/basebox
    VM_EXISTS=$(vboxmanage list vms | cut -d ' ' -f 1 | grep '"multipaas-basebox"')
    if [ "$VM_EXISTS" != "" ]; then
        BASE_BOX_UP=$(vboxmanage showvminfo "multipaas-basebox" | grep -e ^State | grep " running ")
        if [ "$BASE_BOX_UP" != "" ]; then
            vboxmanage controlvm "multipaas-basebox" poweroff soft &>>$err_log &
            bussy_indicator "Stopping basebox VM..."
            vboxmanage unregistervm --delete "multipaas-basebox" &>>$err_log &
            bussy_indicator "Cleanup previous basebox VM..."
            log "\n"
            log "\n"
        else
            BASE_BOX_OFF=$(vboxmanage showvminfo "multipaas-basebox" | grep -e ^State | grep "powered\|aborted\|paused")
            if [ "$BASE_BOX_OFF" != "" ]; then
                vboxmanage unregistervm --delete "multipaas-basebox" &>>$err_log &
                bussy_indicator "Cleanup previous basebox VM..."
                log "\n"
                log "\n"
            fi
        fi
    fi

    warn "==> Building MultiPaaS base box VM\n\n"
            
    # set_vagrant_network_interface "multipaas" "$IFACE"
    vagrant up --no-provision &>>$err_log &
    bussy_indicator "Initialize base box VM..."
    log "\n"

    vagrant provision --provision-with init &>>$err_log &
    bussy_indicator "Setup and provision base box..."
    log "\n"
    vagrant provision --provision-with cleanup &>>$err_log &
    bussy_indicator "Cleaning up base box resources..."
    log "\n"
    
    if [ -f "./multipaas-basebox-centos7.box" ]; then
        rm -rf ./multipaas-basebox-centos7.box
    fi

    vagrant package --output ./multipaas-basebox-centos7.box &>>$err_log &
    bussy_indicator "Exporting basebox..."
    log "\n"
}

########################################
# 
########################################
install_base_box() {
    cd $_DIR
    cd k8s/basebox

    log "\n"
    warn "==> Installing MultiPaaS base box\n\n"

    if [ ! -f "./multipaas-basebox-centos7.box" ]; then
        error "Base box file does not exist, can't install it.\n"
        exit 1
    fi

    VAGRANT_BOX_EXISTS=$(vagrant box list | grep "multipaas-basebox-centos/7")
    if [ "$VAGRANT_BOX_EXISTS" != "" ]; then
        vagrant box remove multipaas-basebox-centos/7 --force &>>$err_log &
        bussy_indicator "Removing previous base box..."
        log "\n"
    fi
    
    vagrant box add multipaas-basebox-centos/7 ./multipaas-basebox-centos7.box --force &>>$err_log &
    bussy_indicator "Installing base box..."
    log "\n"
    log "\n"
}

########################################
# 
########################################
destroy_base_boxes() {
    cd $_DIR
    cd k8s/basebox
    warn "==> Deleting local MultiPaaS base box VM\n\n"
    VM_EXISTS=$(vboxmanage list vms | cut -d ' ' -f 1 | grep '"multipaas-basebox"')
    if [ "$VM_EXISTS" != "" ]; then
        BASE_BOX_UP=$(vboxmanage showvminfo "multipaas-basebox" | grep -e ^State | grep " running ")
        if [ "$BASE_BOX_UP" != "" ]; then
            
            vboxmanage controlvm "multipaas-basebox" poweroff soft &>>$err_log &
            bussy_indicator "Stopping basebox VM..."
            vboxmanage unregistervm --delete "multipaas-basebox" &>>$err_log &
            bussy_indicator "Cleanup previous basebox VM..."
            log "\n"
        else
            BASE_BOX_OFF=$(vboxmanage showvminfo "multipaas-basebox" | grep -e ^State | grep "powered\|aborted\|paused")
            if [ "$BASE_BOX_OFF" != "" ]; then
                vboxmanage unregistervm --delete "multipaas-basebox" &>>$err_log &
                bussy_indicator "Cleanup previous basebox VM..."
                log "\n"
            fi
        fi
    fi
}

########################################
# 
########################################
k8s_build_base_boxes() {
    cd $_DIR

    VAGRANT_BOX_EXISTS=$(vagrant box list | grep "multipaas-basebox")
    if [ "$VAGRANT_BOX_EXISTS" = "" ]; then
        error "Base box is not installed.\n"
        exit 1
    fi
    cd k8s/basebox-k8s-master
    log "\n"
    warn "==> Building MultiPaaS K8S-Cluster master base box VM\n\n"

    VM_EXISTS=$(vboxmanage list vms | cut -d ' ' -f 1 | grep '"master.base"')
    if [ "$VM_EXISTS" != "" ]; then
        MASTER_BOX_UP=$(vboxmanage showvminfo "master.base" | grep -e ^State | grep " running ")
        if [ "$MASTER_BOX_UP" != "" ]; then
            vboxmanage controlvm "master.base" poweroff soft &>>$err_log &
            bussy_indicator "Stopping previous master VM..."
            vboxmanage unregistervm --delete "master.base" &>>$err_log &
            bussy_indicator "Cleanup previous master VM..."
            log "\n"
        else
            MASTER_BOX_OFF=$(vboxmanage showvminfo "master.base" | grep -e ^State | grep "powered\|aborted\|paused")
            if [ "$MASTER_BOX_OFF" != "" ]; then                
                vboxmanage unregistervm --delete "master.base" &>>$err_log &
                bussy_indicator "Cleanup previous master VM..."
                log "\n"
            fi
        fi
    fi

    vagrant up --no-provision &>>$err_log &
    bussy_indicator "Start up master VM..."
    log "\n"
    
    vagrant provision --provision-with init &>>$err_log &
    bussy_indicator "Provisionning base components..."
    log "\n"
    
    vagrant provision --provision-with rpms &>>$err_log &
    bussy_indicator "Downloading RPM packages..."
    log "\n"

    vagrant provision --provision-with images &>>$err_log &
    bussy_indicator "Downloading docker images..."
    log "\n"

    vagrant provision --provision-with install &>>$err_log &
    bussy_indicator "Installing master components..."
    log "\n"

    rm -rf ./multipaas-master.box
   
    vagrant package --output ./multipaas-master.box &>>$err_log &
    bussy_indicator "Exporting master box..."
    log "\n"
  
    vagrant destroy -f &>>$err_log &
    bussy_indicator "Cleanup master VM..."
    rm -rf .vagrant
    log "\n"

    cd ../basebox-k8s-worker

    log "\n"
    warn "==> Building MultiPaaS K8S-Cluster worker base box VM\n\n"

    VM_EXISTS=$(vboxmanage list vms | cut -d ' ' -f 1 | grep '"worker.base"')
    if [ "$VM_EXISTS" != "" ]; then
        WORKER_BOX_UP=$(vboxmanage showvminfo "worker.base" | grep -e ^State | grep " running ")
        if [ "$WORKER_BOX_UP" != "" ]; then
            vboxmanage controlvm "worker.base" poweroff soft &>>$err_log &
            bussy_indicator "Stop previous worker VM..."
            vboxmanage unregistervm --delete "worker.base" &>>$err_log &
            bussy_indicator "Cleanup previous worker VM..."
            log "\n"
        else
            WORKER_BOX_OFF=$(vboxmanage showvminfo "worker.base" | grep -e ^State | grep "powered\|aborted\|paused")
            if [ "$WORKER_BOX_OFF" != "" ]; then
                vboxmanage unregistervm --delete "worker.base" &>>$err_log &
                bussy_indicator "Cleanup previous worker VM..."
                log "\n"
            fi
        fi
    fi

    vagrant up --no-provision &>>$err_log &
    bussy_indicator "Start up worker VM..."
    log "\n"
    
    vagrant provision --provision-with init &>>$err_log &
    bussy_indicator "Provisionning base components..."
    rm -rf ./multipaas-worker.box
    log "\n"
    
    vagrant package --output ./multipaas-worker.box &>>$err_log &
    bussy_indicator "Exporting worker box..."  
    log "\n"
    
    vagrant destroy -f &>>$err_log &
    bussy_indicator "Cleanup previous worker VM..."
    rm -rf .vagrant
    log "\n"
}

########################################
# 
########################################
k8s_install_base_boxes() {
    cd $_DIR

    log "\n"
    warn "==> Installing MultiPaaS K8S-Cluster base boxes VM\n\n"

    if [ ! -f "./k8s/basebox-k8s-master/multipaas-master.box" ]; then
        error "Master base box file does not exist, can't install it.\n"
        exit 1
    fi

    if [ ! -f "./k8s/basebox-k8s-worker/multipaas-worker.box" ]; then
        error "Worker base box file does not exist, can't install it.\n"
        exit 1
    fi

    VAGRANT_BOX_EXISTS=$(vagrant box list | grep "multipaas-master")
    if [ "$VAGRANT_BOX_EXISTS" != "" ]; then
        vagrant box remove multipaas-master --force &>>$err_log &
        bussy_indicator "Removing previous master box..."
        log "\n"
    fi
    
    vagrant box add multipaas-master k8s/basebox-k8s-master/multipaas-master.box &>>$err_log &
    bussy_indicator "Installing master box..."
    log "\n"

    VAGRANT_BOX_EXISTS=$(vagrant box list | grep "multipaas-worker")
    if [ "$VAGRANT_BOX_EXISTS" != "" ]; then
        vagrant box remove multipaas-worker --force &>>$err_log &
        bussy_indicator "Removing previous worker box..."
        log "\n"
    fi
    
    vagrant box add multipaas-worker k8s/basebox-k8s-worker/multipaas-worker.box &>>$err_log &
    bussy_indicator "Installing worker box..."
    log "\n"
}