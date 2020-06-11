#!/bin/bash

_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"
cd $_DIR

err_log=$_DIR/std.log

. ../../_libs/common.sh
. ../../_libs/distro.sh
. ../../_libs/dep_offline.sh

########################################
# 
########################################
dependencies () {
    sudo echo "" # Ask user for sudo password now

    DK_EXISTS=$(command -v docker)
    dep_docker &>>$err_log &
    bussy_indicator "Dependency on \"Docker CE\"..."
    log "\n"
    if [ "$DK_EXISTS" == "" ]; then
        log "\n"
        warn "==> Docker was just installed, you will have to restart your session before starting the cluster-ctl container.\n"
        warn "    Please log out, and log back in, then execute this script again.\n"
        exit 1
    fi

    dep_jq &>>$err_log &
    bussy_indicator "Dependency on \"jq\"..."
    log "\n"

    dep_curl &>>$err_log &
    bussy_indicator "Dependency on \"curl\"..."
    log "\n"

    dep_sshpass &>>$err_log &
    bussy_indicator "Dependency on \"sshpass\"..."
    log "\n"

    sudo systemctl enable docker > /dev/null 2>&1 
    sudo systemctl start docker > /dev/null 2>&1 


    if [ "$(docker images | grep -E 'eclipse-mosquitto.*1.6')" == "" ]; then
        sudo docker load --input ../../build/offline_files/docker_images/eclipse-mosquitto-1.6.tar &>>$err_log &
        bussy_indicator "Loading docker image eclipse-mosquitto..."
        log "\n"
    fi

    if [ "$(docker images | grep -E 'keycloak.*9.0.3')" == "" ]; then
        sudo docker load --input ../../build/offline_files/docker_images/keycloak-9.0.3.tar &>>$err_log &
        bussy_indicator "Loading docker image keycloak..."
        log "\n"
    fi

    if [ "$(docker images | grep -E 'gitlab-ce.*12.10.1-ce.0')" == "" ]; then
        sudo docker load --input ../../build/offline_files/docker_images/gitlab-ce-12.10.1-ce.0.tar &>>$err_log &
        bussy_indicator "Loading docker image gitlab-ce..."
        log "\n"
    fi

    if [ "$(docker images | grep -E 'nginx.*1.17.10-alpine')" == "" ]; then
        sudo docker load --input ../../build/offline_files/docker_images/nginx-1.17.10-alpine.tar &>>$err_log &
        bussy_indicator "Loading docker image nginx..."
        log "\n"
    fi

    if [ "$(docker images | grep -E 'registry.*2.7.1')" == "" ]; then
        sudo docker load --input ../../build/offline_files/docker_images/registry-2.7.1.tar &>>$err_log &
        bussy_indicator "Loading docker image registry..."
        log "\n"
    fi

    if [ "$(docker images | grep -E 'postgres.*12.2-alpine')" == "" ]; then
        sudo docker load --input ../../build/offline_files/docker_images/postgres-12.2-alpine.tar &>>$err_log &
        bussy_indicator "Loading docker image postgres..."
        log "\n"
    fi

    if [ "$(docker images | grep -E 'node.*12.16.2')" == "" ]; then
        sudo docker load --input ../../build/offline_files/docker_images/node-12.16.2.tar &>>$err_log &
        bussy_indicator "Loading docker image node..."
        log "\n"
    fi

    if [ "$(docker images | grep -E 'multipaas-api.*0.9')" == "" ]; then
        sudo docker load --input ../../build/offline_files/docker_images/multipaas-api-0.9.tar &>>$err_log &
        bussy_indicator "Loading docker image multipaas-api..."
        log "\n"
    fi

    if [ "$(docker images | grep -E 'multipaas-ctrl.*0.9')" == "" ]; then
        sudo docker load --input ../../build/offline_files/docker_images/multipaas-ctrl-0.9.tar &>>$err_log &
        bussy_indicator "Loading docker image multipaas-ctrl..."
        log "\n"
    fi
}

########################################
# 
########################################
collect_informations() {
    get_network_interface_ip IFACE LOCAL_IP

    log "\n"
    read_input "Specify a MultiPaaS master user email address:" MP_U
   
    log "\n"
    read_input "Specify a MultiPaaS master password:" MP_P
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
    if [ "$DISTRO" == "redhat" ]; then
        if [[ `firewall-cmd --state` = running ]]; then
            sudo firewall-cmd --zone=public --permanent --add-service=http
            sudo firewall-cmd --zone=public --permanent --add-service=https
            sudo firewall-cmd --reload
        fi
    fi
}

########################################
# 
########################################
install_core_components() {
    BASE_FOLDER="$(dirname "$_DIR")"
    BASE_FOLDER="$(dirname "$BASE_FOLDER")"
    BASE_FOLDER="$(dirname "$BASE_FOLDER")"

    cd $BASE_FOLDER

    POSTGRES_PASSWORD="$MP_P"
    KEYCLOAK_PASSWORD="$MP_P"
    API_SYSADMIN_USER="$MP_U"
    API_SYSADMIN_PASSWORD="$MP_P"
    API_IP="$LOCAL_IP"

    function join_by { local IFS="$1"; shift; echo "$*"; }
    arrIN=(${LOCAL_IP//./ })
    IP_SUB="${arrIN[@]:(-1)}"
    unset 'arrIN[${#arrIN[@]}-1]'
    DHCP_MASK=$(join_by . "${arrIN[@]}")
    DHCP_RESERVED="[250,251,252,253,254,$IP_SUB]"
    POSTGRES_USER="postgres"
    NGINX_HOST_IP="$LOCAL_IP"
    DB_HOST="$LOCAL_IP"
    MOSQUITTO_IP="$LOCAL_IP"
    REGISTRY_IP="$LOCAL_IP"
    DB_PASS=$POSTGRES_PASSWORD

    mkdir -p $HOME/.multipaas/nginx/certs
    mkdir -p $HOME/.multipaas/nginx/certs/tenants
    mkdir -p $HOME/.multipaas/nginx/conf.d
    mkdir -p $HOME/.multipaas/nginx/letsencrypt
    mkdir -p $HOME/.multipaas/postgres/pg-init-scripts
    mkdir -p $HOME/.multipaas/gitlab
    mkdir -p $HOME/.multipaas/docker-registry/data

    mkdir -p $HOME/.multipaas/auth/registry
    mkdir -p $HOME/.multipaas/auth/nginx

    cp $BASE_FOLDER/install/control-plane/pg_resources/create-multiple-postgresql-databases.sh $HOME/.multipaas/postgres/pg-init-scripts
    cp $BASE_FOLDER/install/control-plane/nginx_resources/nginx.conf $HOME/.multipaas/nginx
    cp $BASE_FOLDER/install/control-plane/nginx_resources/registry.conf $HOME/.multipaas/nginx/conf.d
    cp $BASE_FOLDER/install/control-plane/nginx_resources/keycloak.conf $HOME/.multipaas/nginx/conf.d
    cp $BASE_FOLDER/install/control-plane/nginx_resources/gitlab.conf $HOME/.multipaas/nginx/conf.d
    touch $HOME/.multipaas/nginx/conf.d/default.conf
    touch $HOME/.multipaas/nginx/conf.d/tcp.conf
    mkdir -p $HOME/.multipaas/postgres/data
    mkdir -p $HOME/.multipaas/mosquitto/config
    mkdir -p $HOME/.multipaas/mosquitto/data
    mkdir -p $HOME/.multipaas/mosquitto/log

    mkdir -p $HOME/tmp

    sed -i "s/<MYCLOUD_API_HOST_PORT>/$API_IP:3030/g" $HOME/.multipaas/nginx/conf.d/registry.conf

    NGINX_CRT_FOLDER=$HOME/.multipaas/nginx/certs
    NGINX_USERS_CRT_FOLDER=$HOME/.multipaas/nginx/certs/tenants
    chmod a+rw $NGINX_USERS_CRT_FOLDER

    # Gitlab
    printf "FR\nGaronne\nToulouse\nmultipaas\nITLAB\nmultipaas.gitlab.com\nmultipaas@multipaas.com\n" | openssl req -newkey rsa:2048 -nodes -sha256 -x509 -days 365 \
        -keyout $NGINX_CRT_FOLDER/nginx-gitlab.key \
        -out $NGINX_CRT_FOLDER/nginx-gitlab.crt > /dev/null 2>&1
    # Registry
    printf "FR\nGaronne\nToulouse\nmultipaas\nITLAB\nmultipaas.registry.com\nmultipaas@multipaas.com\n" | openssl req -newkey rsa:2048 -nodes -sha256 -x509 -days 365 \
        -keyout $NGINX_CRT_FOLDER/docker-registry.key \
        -out $NGINX_CRT_FOLDER/docker-registry.crt > /dev/null 2>&1 
    printf "FR\nGaronne\nToulouse\nmultipaas\nITLAB\nregistry.multipaas.org\nmultipaas@multipaas.com\n" | openssl req -newkey rsa:2048 -nodes -sha256 -x509 -days 365 \
        -keyout $NGINX_CRT_FOLDER/nginx-registry.key \
        -out $NGINX_CRT_FOLDER/nginx-registry.crt > /dev/null 2>&1 
    # Keycloak
    cat <<EOT >> ssl.conf
[ req ]
distinguished_name	= req_distinguished_name
attributes		= req_attributes

[ req_distinguished_name ]
countryName			= Country Name (2 letter code)
countryName_min			= 2
countryName_max			= 2
stateOrProvinceName		= State or Province Name (full name)
localityName			= Locality Name (eg, city)
0.organizationName		= Organization Name (eg, company)
organizationalUnitName		= Organizational Unit Name (eg, section)
commonName			= Common Name (eg, fully qualified host name)
commonName_max			= 64
emailAddress			= Email Address
emailAddress_max		= 64

[ req_attributes ]
challengePassword		= A challenge password
challengePassword_min		= 4
challengePassword_max		= 20

req_extensions = v3_req

[ v3_req ]
# Extensions to add to a certificate request
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
EOT
    openssl genrsa -out \
        $NGINX_CRT_FOLDER/rootCA.key \
        4096 > /dev/null 2>&1
    openssl req -x509 -new -nodes \
        -key $NGINX_CRT_FOLDER/rootCA.key -sha256 -days 1024 \
        -out $NGINX_CRT_FOLDER/rootCA.crt \
        -subj /C=FR/ST=Garonne/L=Toulouse/O=multipaas/OU=ITLAB/CN=multipaas.keycloak.com/emailAddress=multipaas@multipaas.com > /dev/null 2>&1
    openssl genrsa \
        -out $NGINX_CRT_FOLDER/nginx-keycloak.key \
        2048 > /dev/null 2>&1
    openssl req -config ./ssl.conf -new \
        -key $NGINX_CRT_FOLDER/nginx-keycloak.key \
        -out $NGINX_CRT_FOLDER/nginx-keycloak.csr \
        -subj /C=FR/ST=Garonne/L=Toulouse/O=multipaas/OU=ITLAB/CN=multipaas.keycloak.com/emailAddress=multipaas@multipaas.com > /dev/null 2>&1
    openssl x509 -req \
        -in $NGINX_CRT_FOLDER/nginx-keycloak.csr \
        -CA $NGINX_CRT_FOLDER/rootCA.crt \
        -CAkey $NGINX_CRT_FOLDER/rootCA.key \
        -CAcreateserial \
        -out $NGINX_CRT_FOLDER/nginx-keycloak.crt \
        -days 500 -sha256 -extensions v3_req -extfile ssl.conf > /dev/null 2>&1

    DR_CRED=$(docker run --entrypoint htpasswd registry:2.7.1 -Bbn multipaas_master_user multipaas_master_pass)
    NR_CRED=$(docker run --entrypoint htpasswd registry:2.7.1 -bn multipaas_master_user multipaas_master_pass)

    cat > $HOME/.multipaas/auth/nginx/htpasswd << EOF
$DR_CRED
EOF

    cat > $HOME/.multipaas/auth/registry/htpasswd << EOF
$NR_CRED
EOF

    touch $HOME/.multipaas/mosquitto/log/mosquitto.log
    chmod o+w $HOME/.multipaas/mosquitto/log/mosquitto.log
    sudo chown 1883:1883 $HOME/.multipaas/mosquitto/log -R

    docker run -d \
        --name multipaas-registry \
        --restart=always -p 5000:5000 \
        -v $HOME/.multipaas/docker-registry/data/:/var/lib/registry \
        -v $HOME/.multipaas/auth/registry:/auth \
        -e "REGISTRY_AUTH=htpasswd" \
        -e "REGISTRY_AUTH_HTPASSWD_REALM=Registry Realm" \
        -e REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd \
        -e REGISTRY_STORAGE_DELETE_ENABLED=true \
        -v $NGINX_CRT_FOLDER:/certs \
        -e REGISTRY_HTTP_TLS_CERTIFICATE=/certs/docker-registry.crt \
        -e REGISTRY_HTTP_TLS_KEY=/certs/docker-registry.key \
        registry:2.7.1 &>>$err_log &
    bussy_indicator "Starting registry..."
    log "\n"

    docker run -d \
        --name multipaas-postgresql \
        --restart unless-stopped \
        --network host \
        -v $HOME/.multipaas/postgres/data:/var/lib/postgresql/data \
        -v $HOME/.multipaas/postgres/pg-init-scripts:/docker-entrypoint-initdb.d \
        -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
        -e KEYCLOAK_USER=keycloak \
        -e KEYCLOAK_PASS=$KEYCLOAK_PASSWORD \
        -e MYCLOUD_USER=multipaas \
        -e MYCLOUD_PASS=multipaaspass \
        postgres:12.2-alpine &>>$err_log &
    bussy_indicator "Starting postgres..."
    log "\n"

    docker run -d \
        --name multipaas-keycloak \
        --restart=always -p 8888:8080 \
        -e DB_VENDOR=POSTGRES \
        -e KEYCLOAK_PASSWORD=$KEYCLOAK_PASSWORD \
        -e KEYCLOAK_USER=admin \
        -e DB_DATABASE=keycloak \
        -e DB_PORT=5432 \
        -e DB_USER=keycloak \
        -e DB_PASSWORD=$KEYCLOAK_PASSWORD \
        -e DB_ADDR=$DB_HOST \
        -e PROXY_ADDRESS_FORWARDING=true \
        jboss/keycloak:9.0.3 &>>$err_log &
    bussy_indicator "Starting keycloak..."
    log "\n"

    docker run -d \
        --name multipaas-nginx \
        --restart unless-stopped \
        --network host \
        -v $HOME/.multipaas/nginx/conf.d:/etc/nginx/conf.d:ro \
        -v $HOME/.multipaas/nginx/nginx.conf:/etc/nginx/nginx.conf \
        -v $HOME/.multipaas/nginx/letsencrypt:/etc/letsencrypt \
        -v $HOME/.multipaas/auth/nginx:/auth \
        -v $HOME/multipaas/install/build/offline_files:/www/static \
        -v $NGINX_CRT_FOLDER:/certs \
        nginx:1.17.10-alpine &>>$err_log &
    bussy_indicator "Starting nginx..."
    log "\n"

    docker run -d \
        --name multipaas-mosquitto \
        --restart unless-stopped \
        --network host \
        -v $HOME/.multipaas/postgres/data:/mosquitto/data \
        -v $HOME/.multipaas/postgres/log:/mosquitto/log \
        -v /etc/localtime:/etc/localtime \
        eclipse-mosquitto:1.6 &>>$err_log &
    bussy_indicator "Starting eclipse-mosquitto..."
    log "\n"

    docker run -d \
        --name multipaas-api \
        --restart unless-stopped \
        --network host \
        -e MP_MODE=unipaas \
        -e NGINX_HOST_IP=$NGINX_HOST_IP \
        -e DB_HOST=$DB_HOST \
        -e DB_USER=$POSTGRES_USER \
        -e DB_PASS=$DB_PASS \
        -e MOSQUITTO_IP=$MOSQUITTO_IP \
        -e API_SYSADMIN_USER=$API_SYSADMIN_USER \
        -e API_SYSADMIN_PASSWORD=$API_SYSADMIN_PASSWORD \
        -e REGISTRY_IP=$REGISTRY_IP \
        -e CRYPTO_KEY=YDbxyG16Q6ujlCpjXH2Pq7nPAtJF66jLGwx4RYkHqhY= \
        -e ENABLE_NGINX_STREAM_DOMAIN_NAME=true \
        -e MP_SERVICES_DIR=/usr/src/app/data/mp_services \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v $HOME/multipaas:/usr/src/app/data \
        -v $HOME/.multipaas/auth/registry:/usr/src/app/auth-docker \
        -v $HOME/.multipaas/auth/nginx:/usr/src/app/auth-nginx \
        multipaas-api:0.9 &>>$err_log &
    bussy_indicator "Starting multipaas-api..."
    log "\n"

    docker run -d \
        --name multipaas-ctrl \
        --restart unless-stopped \
        --network host \
        -e DB_HOST=$DB_HOST \
        -e DB_USER=$POSTGRES_USER \
        -e DB_PASS=$DB_PASS \
        -e MOSQUITTO_IP=$MOSQUITTO_IP \
        -e NGINX_HOST_IP=$NGINX_HOST_IP \
        -e ENABLE_NGINX_STREAM_DOMAIN_NAME=true \
        -e DHCP_OVERWRITE=true \
        -e DHCP_MASK=$DHCP_MASK \
        -e DHCP_RESERVED=$DHCP_RESERVED \
        -e DHCT_USE_PING=true \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v $HOME/.multipaas/nginx:/usr/src/app/nginx \
        -v $NGINX_USERS_CRT_FOLDER:/certs \
        multipaas-ctrl:0.9 &>>$err_log &
    bussy_indicator "Starting multipaas-ctrl..."
    log "\n"
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
    log "  1. Add the following line to your '/etc/hosts' file: $LOCAL_IP multipaas.com multipaas.registry.com registry.multipaas.org multipaas.keycloak.com multipaas.gitlab.com multipaas.static.com\n"
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
    while [[ "$KEYCLOAK_SECRET" == '' ]]; do
        read_input "\nInvalide answer, try again:" KEYCLOAK_SECRET
    done
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
    MP_TOKEN=$(curl -s http://$LOCAL_IP:3030/authentication/ \
        -H 'Content-Type: application/json' \
        --data-binary '{ "strategy": "local", "email": "'"$MP_U"'", "password": "'"$MP_P"'" }' | jq -r '.accessToken')

    curl -s -k \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $MP_TOKEN" \
        -X POST \
        -d '{"key":"KEYCLOAK_SECRET","value":"'"$KEYCLOAK_SECRET"'"}' \
        http://$LOCAL_IP:3030/settings 2>&1 | log_error_sanitizer
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
        http://$LOCAL_IP:3030/settings 2>&1 | log_error_sanitizer

    POSTGRES_PASSWORD="$MP_P"
    API_SYSADMIN_PASSWORD="$MP_P"
    GITLAB_IP="$LOCAL_IP"
    GITLAB_KC_SECRET="$GITLAB_SECRET"

    touch ./_drun.sh
    chmod +rwx ./_drun.sh 

    cat > ./_drun.sh << ENDOFFILE
#!/bin/bash
sudo docker run -d \
  --hostname multipaas.gitlab.com \
  --env GITLAB_OMNIBUS_CONFIG="\
  gitlab_rails['gitlab_shell_ssh_port'] = 2289;\
  gitlab_rails['initial_root_password'] = '<API_SYSADMIN_PASSWORD>';\
  gitlab_rails['gitlab_signin_enabled'] = false;\
  external_url 'http://<IP_PLACEHOLDER>:8929';\
  gitlab_rails['omniauth_allow_single_sign_on'] = ['openid_connect'];\
  gitlab_rails['omniauth_sync_email_from_provider'] = 'openid_connect';\
  gitlab_rails['omniauth_sync_profile_from_provider'] = ['openid_connect'];\
  gitlab_rails['omniauth_sync_profile_attributes'] = ['email'];\
  gitlab_rails['omniauth_block_auto_created_users'] = false;\
  gitlab_rails['omniauth_providers'] = [\
    {\
      'name' => 'openid_connect',\
      'label' => 'keycloak',\
      'args' => {\
        'name' => 'openid_connect',\
        'scope' => ['openid','profile'],\
        'response_type' => 'code',\
        'issuer' => 'https://multipaas.keycloak.com/auth/realms/master',\
        'discovery' => true,\
        'client_auth_method' => 'query',\
        'uid_field' => 'email',\
        'send_scope_to_token_endpoint' => 'false',\
        'client_options' => {\
          'identifier' => 'gitlab',\
          'secret' => '<GITLAB_KC_SECRET>',\
          'redirect_uri' => 'https://multipaas.gitlab.com/users/auth/openid_connect/callback',\
          'end_session_endpoint' => 'https://multipaas.keycloak.com/auth/realms/master/protocol/openid-connect/logout'\
        }\
      }\
    }\
  ];\
  "\
  --publish 8929:8929 --publish 2289:22 \
  --name multipaas-gitlab \
  --restart unless-stopped \
  --add-host multipaas.keycloak.com:172.17.0.1 \
  --volume $HOME/.multipaas/gitlab/config:/etc/gitlab \
  --volume $HOME/.multipaas/gitlab/logs:/var/log/gitlab \
  --volume $HOME/.multipaas/gitlab/data:/var/opt/gitlab \
  gitlab/gitlab-ce:12.10.1-ce.0
ENDOFFILE

    sed -i "s/<IP_PLACEHOLDER>/$GITLAB_IP/g" ./_drun.sh
    sed -i "s/<API_SYSADMIN_PASSWORD>/$API_SYSADMIN_PASSWORD/g" ./_drun.sh
    sed -i "s/<GITLAB_KC_SECRET>/$GITLAB_KC_SECRET/g" ./_drun.sh

    ./_drun.sh > /dev/null 2>&1
    rm -rf ./_drun.sh

    ########################################
    # Reconfigure GitLab & restart it
    ########################################
    echo "Waiting for GitLab to be up and running (this can take up to 4 minutes)"
    until $(curl --output /dev/null --silent --head --fail http://$GITLAB_IP:8929/users/sign_in); do
        printf '.'
        sleep 5
    done

    # Copy root CA from NGInx Keycloak to Gitlab container
    docker cp $NGINX_CRT_FOLDER/rootCA.crt multipaas-gitlab:/etc/gitlab/trusted-certs/rootCA.crt

    GITLAB_TOKEN=$(date +%s | sha256sum | base64 | head -c 32 ; echo)
    docker exec -t -u git multipaas-gitlab gitlab-rails r "token_digest = Gitlab::CryptoHelper.sha256 \"$GITLAB_TOKEN\"; token = PersonalAccessToken.new(user: User.where(id: 1).first, name: 'temp token', token_digest: token_digest, scopes: [:api]); token.save"'!'

    # Disable registration
    curl --silent --request PUT --header "PRIVATE-TOKEN: $GITLAB_TOKEN" http://$GITLAB_IP:8929/api/v4/application/settings?signup_enabled=false&allow_local_requests_from_hooks_and_services=true&allow_local_requests_from_web_hooks_and_services=true&allow_local_requests_from_system_hooks=true
    # after_sign_out_path

    docker stop multipaas-gitlab
    docker start multipaas-gitlab
    echo "Waiting for GitLab to be up and running (this can take up to 4 minutes)"
    until $(curl --output /dev/null --silent --head --fail http://$GITLAB_IP:8929/users/sign_in); do
        printf '.'
        sleep 5
    done

    log "\n"
    return 0
}




                                                          
                                                          


########################################
# LOGIC...
########################################


if [ -d "$HOME/.multipaas/nginx" ]; then
    echo "The control plane is already installed on this machine"
    exit 1
fi


/usr/bin/clear

base64 -d <<<"ICAgXyAgICBfICAgICAgIF8gX19fX18gICAgICAgICAgICAgX19fX18gICAgX19fX18gX19fX18gIAogIHwgfCAgfCB8ICAgICAoXykgIF9fIFwgICAgICAgICAgIC8gX19fX3wgIC8gX19fX3wgIF9fIFwgCiAgfCB8ICB8IHxfIF9fICBffCB8X18pIHxfIF8gIF9fIF98IChfX18gICB8IHwgICAgfCB8X18pIHwKICB8IHwgIHwgfCAnXyBcfCB8ICBfX18vIF9gIHwvIF9gIHxcX19fIFwgIHwgfCAgICB8ICBfX18vIAogIHwgfF9ffCB8IHwgfCB8IHwgfCAgfCAoX3wgfCAoX3wgfF9fX18pIHwgfCB8X19fX3wgfCAgICAgCiAgIFxfX19fL3xffCB8X3xffF98ICAgXF9fLF98XF9fLF98X19fX18vICAgXF9fX19ffF98ICAgICA="
log "\n\n"

# Figure out what distro we are running
distro

# Install dependencies
dependencies

# Collect info from user
collect_informations

# Configure firewall
# configure_firewall &>>$err_log

sudo sed '/multipaas.com/d' /etc/hosts &>>$err_log
sudo -- sh -c "echo $LOCAL_IP multipaas.com multipaas.registry.com registry.multipaas.org multipaas.keycloak.com multipaas.gitlab.com multipaas.static.com multipaas.static.com >> /etc/hosts" &>>$err_log

# Install the core components
install_core_components

# # Setup keycloak admin client
setup_keycloak

# # Install gitlab
install_gitlab

CRT="$(cat $NGINX_CRT_FOLDER/docker-registry.crt)"
CRT_NGINX="$(cat $NGINX_CRT_FOLDER/nginx-registry.crt)"

rm -rf $HOME/configPrivateRegistry.sh

echo "#!/bin/bash"  >> $HOME/configPrivateRegistry.sh
echo "rm -rf /etc/docker/certs.d/multipaas.registry.com:5000" >> $HOME/configPrivateRegistry.sh
echo "mkdir -p /etc/docker/certs.d/multipaas.registry.com:5000" >> $HOME/configPrivateRegistry.sh
echo "cat <<EOT >> /etc/docker/certs.d/multipaas.registry.com:5000/ca.crt" >> $HOME/configPrivateRegistry.sh
echo "$CRT"  >> $HOME/configPrivateRegistry.sh
echo "EOT"  >> $HOME/configPrivateRegistry.sh
echo "rm -rf /etc/docker/certs.d/registry.multipaas.org" >> $HOME/configPrivateRegistry.sh
echo "mkdir -p /etc/docker/certs.d/registry.multipaas.org" >> $HOME/configPrivateRegistry.sh
echo "cat <<EOT >> /etc/docker/certs.d/registry.multipaas.org/ca.crt" >> $HOME/configPrivateRegistry.sh
echo "$CRT_NGINX"  >> $HOME/configPrivateRegistry.sh
echo "EOT"  >> $HOME/configPrivateRegistry.sh
echo "systemctl stop docker && systemctl start docker"  >> $HOME/configPrivateRegistry.sh

sudo chown $USER: $HOME/configPrivateRegistry.sh
chmod +x $HOME/configPrivateRegistry.sh

# Done
log "\n"
success "[DONE] MultiPaaS control-plane deployed successfully!\n"
warn "[INFO] If no domain name (DNS resolvable) is configured, on all machines that will interact with MultiPaaS, add the following entry to your /etc/hosts file:\n"
log " ==> $LOCAL_IP multipaas.com multipaas.registry.com registry.multipaas.org multipaas.keycloak.com multipaas.gitlab.com multipaas.static.com\n"
log "\n"

cd "$_PWD"