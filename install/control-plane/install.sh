#!/bin/bash

_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"
cd $_DIR

BASE_FOLDER="$(dirname "$_DIR")"
BASE_FOLDER="$(dirname "$BASE_FOLDER")"

err_log=$_DIR/std.log

. ../_libs/common.sh
. ../_libs/distro.sh
. ../_libs/dep_offline.sh

########################################
# 
########################################
dependencies () {
    VBASEBOX_EXIST=$(vagrant box list | grep "multipaas-basebox-centos/7")
    if [ "$VBASEBOX_EXIST" == "" ]; then
        error "The control plane VM requires that the MultiPaaS Base Box is installed on this machin.\n" 
        warn "If you have already prepared for the installation according to your OS (see documentation\n"
        warn "about installing MultiPaaS), then simply run the following command to install the basebox:\n"
        log "\n"
        log "  ./install/build/prepare.sh --skip-base-box --skip-k8s-boxes --skip-target-build --install-base-box\n"
        log "\n"
        exit 1
    fi

    VB_EXISTS=$(command -v vboxmanage)
    if [ "$VB_EXISTS" == "" ] && [ "$DISTRO" == "redhat" ]; then
        error "The control plane will be installed in a Virtualbox VM, but Virtualbox is not installed.\n" 
        warn "Please install Virtualbox first, then run this script again.\n"
        exit 1
    elif [ "$VB_EXISTS" == "" ] && [ "$DISTRO" == "centos" ]; then
        error "The control plane will be installed in a Virtualbox VM, but Virtualbox is not installed.\n" 
        warn "Please install Virtualbox first, then run this script again.\n"
        exit 1
    fi

    sudo echo "" # Ask user for sudo password now

    if [ "$VB_EXISTS" == "" ] && [ "$DISTRO" == "redhat" ]; then
        sudo yum module enable perl -y &>>$err_log
    elif [ "$VB_EXISTS" == "" ] && [ "$DISTRO" == "centos" ]; then
        sudo yum module enable perl -y &>>$err_log
    fi

    VAG_EXISTS=$(command -v vagrant)
    if [ "$VAG_EXISTS" == "" ] || [ "$VB_EXISTS" == "" ]; then
        log "==> This script will install the following components:\n"
        log "\n"
    else
        log "==> This script will install and configure the control-plane services.\n"
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
    log "\n"

    cd $_DIR

    dep_vbox &>>$err_log &
    bussy_indicator "Dependency on \"Virtualbox and Vagrant\"..."
    log "\n"

    dep_jq &>>$err_log &
    bussy_indicator "Dependency on \"jq\"..."
    log "\n"

    dep_curl &>>$err_log &
    bussy_indicator "Dependency on \"curl\"..."
    log "\n"
}

########################################
# 
########################################
collect_informations() {
    log "\n"
    read_input "Enter IP address you wish to assign to the control-plane VM (make sure the IP is currently available on your network):" VM_IP
    lognl "Checking..."
    if ping -c1 -t3 $VM_IP >/dev/null 2>&1
    then
        error "ERROR => This IP is currently in use\n"
        exit 1
    fi
    log "\n"
    read_input "Specify a MultiPaaS sysadmin user email address:" MP_U
   
    log "\n"
    read_input "Specify a MultiPaaS sysadmin password:" MP_P
   
    log "\n"
    read_input "How much memory (MB) do you wish to allocate to the control plane VM:" VB_MEMORY
    if [ "$VB_MEMORY" -le "2048" ]; then
        error "$VB_MEMORY is not enougth to run the control plane. minimum memory is 2048 MB\n";
        exit 1
    fi

    log "\n"
    read_input "What disk size (GB) should the Docker-Registry have in total:" REGISTRY_SIZE
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
            sudo firewall-cmd --permanent --add-port=5432/tcp
            sudo firewall-cmd --permanent --add-port=5000/tcp
            sudo firewall-cmd --reload
        fi
    fi
}

########################################
# 
########################################
install_core_components() {
    cd $_DIR

    cp ./Vagrantfile.template ./Vagrantfile

    sed -i "s/<BASE_FOLDER>/${BASE_FOLDER//\//\\/}/g" ./Vagrantfile
    sed -i "s/<VM_IP>/$VM_IP/g" ./Vagrantfile
    sed -i "s/<PSQL_P>/$MP_P/g" ./Vagrantfile
    sed -i "s/<KEYCLOAK_P>/$MP_P/g" ./Vagrantfile
    sed -i "s/<MP_U>/$MP_U/g" ./Vagrantfile
    sed -i "s/<MP_P>/$MP_P/g" ./Vagrantfile
    sed -i "s/<VB_MEMORY>/$VB_MEMORY/g" ./Vagrantfile
    sed -i "s/<REGISTRY_SIZE>/$REGISTRY_SIZE/g" ./Vagrantfile
    if [ "$DISTRO" == "ubuntu" ]; then
        sed -i "s/<TARGET_IMG_OS_NAME>/ubuntu_bionic/g" ./Vagrantfile
    fi
    if [ "$DISTRO" == "redhat" ] || [ "$DISTRO" == "centos" ]; then
        sed -i "s/<TARGET_IMG_OS_NAME>/centos8/g" ./Vagrantfile
    fi
    
    log "\n"
    vagrant up --no-provision &>>$err_log &
    bussy_indicator "Starting control-plane VM..."
    log "\n"
    vagrant provision --provision-with base &>>$err_log &
    bussy_indicator "Installing control-plane components..."
    log "\n"
    return 0
}

########################################
# 
########################################
setup_keycloak() {
    # Wait untill Keycloak is up and running
    log "Waiting for Keycloak to become available (this can take up to 2 minutes)\n"
    until $(curl -k --output /dev/null --silent --head --fail https://multipaas.keycloak.com/auth/admin/master/console); do
        printf '.'
        sleep 5
    done

    log "\n"
    log "\n"
    log "To finalyze the setup, do the following:\n"
    log "\n"
    log "  1. Add the following line to your '/etc/hosts' file: $VM_IP multipaas.com multipaas.registry.com registry.multipaas.org multipaas.keycloak.com multipaas.gitlab.com multipaas.static.com\n"
    log "  2. Open a browser and go to '"
    warn "https://multipaas.keycloak.com/auth/admin/master/console/#/realms/master/clients"
    log "'\n"
    log "  3. Keycloak uses a self signed certificate, add an exception to your browser to access the website\n"
    log "  4. Login to the Keycloak Admin page with the credentials '"
    warn "admin/$MP_P"
    log "'\n"
    log "  3. From the 'Clients' section, click on the client 'master-realm'\n"
    log "  4. Change 'Access Type' value to 'confidential'\n"
    log "  5. Enable the boolean value 'Service Accounts Enabled'\n"
    log "  6. Set 'Valid Redirect URIs' value to '*'\n"
    log "  7. Save those changes (button at the bottom of the page)\n"
    log "  8. Go to the 'Service Account Roles' tab and add the role 'admin' to the 'Assigned Roles' box\n"
    log "  9. Click on tab 'Credentials'\n"
    log "  10. When ready, copy and paste the 'Secret' value into this terminal, then press enter:\n"
    log "\n"
    read_input "SECRET:" KEYCLOAK_SECRET
    log "\n"

    # Get master token from Keycloak
    KC_TOKEN=$(curl -s -k -X POST \
        'https://multipaas.keycloak.com/auth/realms/master/protocol/openid-connect/token' \
        -H "Content-Type: application/x-www-form-urlencoded"  \
        -d "grant_type=client_credentials" \
        -d "client_id=master-realm" \
        -d "client_secret=$KEYCLOAK_SECRET" \
        -d "username=admin"  \
        -d "password=$MP_P" \
        -d "scope=openid" | jq -r '.access_token')

    # Create client for kubernetes
    curl -s -k --request POST \
        -H "Accept: application/json" \
        -H "Content-Type:application/json" \
        -H "Authorization: Bearer $KC_TOKEN" \
        -d '{"clientId": "kubernetes-cluster", "publicClient": true, "standardFlowEnabled": true, "directGrantsOnly": true, "redirectUris": ["*"], "protocolMappers": [{"name": "groups", "protocol": "openid-connect", "protocolMapper": "oidc-group-membership-mapper", "config": {"claim.name" : "groups", "full.path" : "true","id.token.claim" : "true", "access.token.claim" : "true", "userinfo.token.claim" : "true"}}]}' \
        https://multipaas.keycloak.com/auth/admin/realms/master/clients

    # Retrieve client UUID
    CLIENT_UUID=$(curl -s -k --request GET \
        -H "Accept: application/json" \
        -H "Content-Type:application/json" \
        -H "Authorization: Bearer $KC_TOKEN" \
        https://multipaas.keycloak.com/auth/admin/realms/master/clients?clientId=kubernetes-cluster | jq '.[0].id' | sed 's/[\"]//g')

    # Create mp base group for multipaas k8s clusters in Keycloak
    curl -s -k --request POST \
        -H "Accept: application/json" \
        -H "Content-Type:application/json" \
        -H "Authorization: Bearer $KC_TOKEN" \
        -d '{"name": "mp"}' \
        https://multipaas.keycloak.com/auth/admin/realms/master/groups

    # Create client roles in Keycloak
    curl -s -k --request POST \
        -H "Accept: application/json" \
        -H "Content-Type:application/json" \
        -H "Authorization: Bearer $KC_TOKEN" \
        --data '{"clientRole": true,"name": "mp-sysadmin"}' \
        https://multipaas.keycloak.com/auth/admin/realms/master/clients/$CLIENT_UUID/roles
    SYSADMIN_ROLE_UUID=$(curl -s -k --request GET \
        -H "Accept: application/json" \
        -H "Content-Type:application/json" \
        -H "Authorization: Bearer $KC_TOKEN" \
        https://multipaas.keycloak.com/auth/admin/realms/master/clients/$CLIENT_UUID/roles/mp-sysadmin | jq '.id' | sed 's/[\"]//g')

    # Update admin email and role
    ADMIN_U_ID=$(curl -s -k --request GET \
        -H "Accept: application/json" \
        -H "Content-Type:application/json" \
        -H "Authorization: Bearer $KC_TOKEN" \
        https://multipaas.keycloak.com/auth/admin/realms/master/users?username=admin | jq '.[0].id' | sed 's/[\"]//g')

    curl -s -k -X PUT \
        https://multipaas.keycloak.com/auth/admin/realms/master/users/$ADMIN_U_ID \
        -H "Content-Type: application/json"  \
        -H "Authorization: Bearer $KC_TOKEN" \
        -d '{"email": "'"$MP_U"'"}'

    curl -s -k --request POST \
        -H "Accept: application/json" \
        -H "Content-Type:application/json" \
        -H "Authorization: Bearer $KC_TOKEN" \
        --data '[{"name": "mp-sysadmin", "id": "'"$SYSADMIN_ROLE_UUID"'"}]' \
        https://multipaas.keycloak.com/auth/admin/realms/master/users/$ADMIN_U_ID/role-mappings/clients/$CLIENT_UUID

    # Login to MultiPaaS with sysadmin credentials
    MP_TOKEN=$(curl -s http://$VM_IP:3030/authentication/ \
        -H 'Content-Type: application/json' \
        --data-binary '{ "strategy": "local", "email": "'"$MP_U"'", "password": "'"$MP_P"'" }' | jq -r '.accessToken')

    curl -s -k \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $MP_TOKEN" \
        -X POST \
        -d '{"key":"KEYCLOAK_SECRET","value":"'"$KEYCLOAK_SECRET"'"}' \
        http://$VM_IP:3030/settings 2>&1 | log_error_sanitizer
}

########################################
# 
########################################
install_gitlab() {
    # Create client for gitlab
    KC_TOKEN=$(curl -s -k -X POST \
        'https://multipaas.keycloak.com/auth/realms/master/protocol/openid-connect/token' \
        -H "Content-Type: application/x-www-form-urlencoded"  \
        -d "grant_type=client_credentials" \
        -d "client_id=master-realm" \
        -d "client_secret=$KEYCLOAK_SECRET" \
        -d "username=admin"  \
        -d "password=$MP_P" \
        -d "scope=openid" | jq -r '.access_token')

    curl -s -k --request POST \
        -H "Accept: application/json" \
        -H "Content-Type:application/json" \
        -H "Authorization: Bearer $KC_TOKEN" \
        -d '{"clientId": "gitlab", "publicClient": true, "standardFlowEnabled": true, "directGrantsOnly": true, "redirectUris": ["*"], "publicClient": false, "bearerOnly": false}' \
        https://multipaas.keycloak.com/auth/admin/realms/master/clients

    sleep 2 # Make sure secret is generated

    GITLAB_CLIENT_UUID=$(curl -s -k --request GET \
        -H "Accept: application/json" \
        -H "Content-Type:application/json" \
        -H "Authorization: Bearer $KC_TOKEN" \
        https://multipaas.keycloak.com/auth/admin/realms/master/clients?clientId=gitlab | jq '.[0].id' | sed 's/[\"]//g')

    GITLAB_SECRET=$(curl -s -k --request GET \
        -H "Accept: application/json" \
        -H "Content-Type:application/json" \
        -H "Authorization: Bearer $KC_TOKEN" \
        https://multipaas.keycloak.com/auth/admin/realms/master/clients/$GITLAB_CLIENT_UUID/client-secret | jq '.value')
    GITLAB_SECRET=${GITLAB_SECRET:1:${#GITLAB_SECRET}-2}

    # Login to MultiPaaS with sysadmin credentials
    MP_TOKEN=$(curl -s http://$VM_IP:3030/authentication/ \
        -H 'Content-Type: application/json' \
        --data-binary '{ "strategy": "local", "email": "'"$MP_U"'", "password": "'"$MP_P"'" }' | jq -r '.accessToken')

    curl -s -k \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $MP_TOKEN" \
        -X POST \
        -d '{"key":"KEYCLOAK_GITLAB_SECRET","value":"'"$GITLAB_SECRET"'"}' \
        http://$VM_IP:3030/settings 2>&1 | log_error_sanitizer

    log "Installing and configuring GitLab"

    sed -i "s/<GITLAB_SECRET>/$GITLAB_SECRET/g" ./Vagrantfile
    vagrant provision --provision-with gitlab &>>$err_log &
    bussy_indicator "Installing GitLab CE on control-plane..."
    log "\n"
    return 0
}






########################################
# LOGIC...
########################################
/usr/bin/clear

base64 -d <<<"IF9fICBfXyAgICAgIF8gXyAgIF8gX19fICAgICAgICAgICBfX18gIF9fXyAgICAgICAgIF8gICAgICAgICAgIF8gX19fIF8gICAgICAgICAgICAgICAKfCAgXC8gIHxfICBffCB8IHxfKF8pIF8gXF9fIF8gX18gXy8gX198LyBfX3xfX18gXyBffCB8XyBfIF8gX19ffCB8IF8gXCB8X18gXyBfIF8gIF9fXyAKfCB8XC98IHwgfHwgfCB8ICBffCB8ICBfLyBfYCAvIF9gIFxfXyBcIChfXy8gXyBcICcgXCAgX3wgJ18vIF8gXCB8ICBfLyAvIF9gIHwgJyBcLyAtXykKfF98ICB8X3xcXyxffF98XF9ffF98X3wgXF9fLF9cX18sX3xfX18vXF9fX1xfX18vX3x8X1xfX3xffCBcX19fL198X3wgfF9cX18sX3xffHxfXF9fX3w="
log "\n\n"

# Figure out what distro we are running
distro

# Install dependencies
dependencies

# Collect info from user
collect_informations

# Configure firewall
configure_firewall &>>$err_log

# Install the core components
install_core_components

sudo sed -i.bak '/multipaas.com/d' /etc/hosts &>>$err_log
sudo rm -rf /etc/hosts.bak &>>$err_log
sudo -- sh -c "echo $VM_IP multipaas.com multipaas.registry.com registry.multipaas.org multipaas.keycloak.com multipaas.gitlab.com multipaas.static.com multipaas.static.com >> /etc/hosts" &>>$err_log

# Setup keycloak admin client
setup_keycloak

# Install gitlab
install_gitlab

AUTOSTART_FILE=/etc/systemd/system/multipaas.service
if [ -f "$AUTOSTART_FILE" ]; then
    success "Autostart service enabled, skipping...\n"
else 
    CURRENT_USER=$(id -u -n)
    DOT_CFG_DIR=$HOME/.multipaas
    mkdir -p $DOT_CFG_DIR

    sudo cp ./startup_cp.sh $DOT_CFG_DIR/startup_cp.sh
    sudo chmod +wx $DOT_CFG_DIR/startup_cp.sh
    sudo sed -i "s/<BASE_FOLDER>/${BASE_FOLDER//\//\\/}/g" $DOT_CFG_DIR/startup_cp.sh

    sudo cp ./multipaas.service $AUTOSTART_FILE
    sudo sed -i "s/<USER>/$CURRENT_USER/g" $AUTOSTART_FILE
    sudo sed -i "s/<DOT_CFG_DIR>/${DOT_CFG_DIR//\//\\/}/g" $AUTOSTART_FILE

    sudo systemctl daemon-reload
    sudo systemctl enable multipaas.service
    sudo systemctl start multipaas.service
fi

# Done
log "\n"
success "[DONE] MultiPaaS control-plane deployed successfully!\n"
warn "[INFO] If no domain name (DNS resolvable) is configured, on all machines that will interact with MultiPaaS, add the following entry to your /etc/hosts file:\n"
log " ==> $VM_IP multipaas.com multipaas.registry.com registry.multipaas.org multipaas.keycloak.com multipaas.gitlab.com multipaas.static.com\n"
log "\n"

cd "$_PWD"