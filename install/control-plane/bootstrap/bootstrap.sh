#!/bin/bash

cat >>/etc/environment<<EOF
LANG=en_US.utf-8
LC_ALL=en_US.utf-8
EOF

########################################
# Update environment file
########################################
echo "export TERM=xterm" >> /etc/bashrc

POSTGRES_PASSWORD="$1"
KEYCLOAK_PASSWORD="$2"
API_SYSADMIN_USER="$3"
API_SYSADMIN_PASSWORD="$4"
API_IP="$5"

function join_by { local IFS="$1"; shift; echo "$*"; }
arrIN=(${API_IP//./ })
IP_SUB="${arrIN[@]:(-1)}"
unset 'arrIN[${#arrIN[@]}-1]'
DHCP_MASK=$(join_by . "${arrIN[@]}")
DHCP_RESERVED="[250,251,252,253,254,$IP_SUB]"
POSTGRES_USER="postgres"
NGINX_HOST_IP="$API_IP"
DB_HOST="$API_IP"
MOSQUITTO_IP="$API_IP"
REGISTRY_IP="$API_IP"
DB_PASS=$POSTGRES_PASSWORD

########################################
# Install RPM packages
########################################
echo "[TASK 1] Install RPM packages"
# yum install -y https://repo.ius.io/ius-release-el7.rpm
yum install -y --cacheonly --disablerepo=* /home/vagrant/rpms/yum-utils/*.rpm
# yum install -y --cacheonly --disablerepo=* /home/vagrant/rpms/lvm2/*.rpm
yum install -y --cacheonly --disablerepo=* /home/vagrant/rpms/sshpass/*.rpm

########################################
# Enable and start docker service
########################################
echo "[TASK 2] Enable and start docker service"
usermod -aG docker vagrant > /dev/null 2>&1 
systemctl enable docker > /dev/null 2>&1 
systemctl start docker > /dev/null 2>&1 

########################################
# Install docker base images
########################################
echo "[TASK 3] Install docker base images"
docker load < /home/vagrant/docker-images/registry-2.7.1.tar
docker load < /home/vagrant/docker-images/postgres-12.2-alpine.tar
docker load < /home/vagrant/docker-images/keycloak-9.0.3.tar
docker load < /home/vagrant/docker-images/nginx-1.17.10-alpine.tar
docker load < /home/vagrant/docker-images/eclipse-mosquitto-1.6.tar
docker load < /home/vagrant/docker-images/node-12.16.2.tar
docker load < /home/vagrant/docker-images/multipaas-api-0.9.tar
docker load < /home/vagrant/docker-images/multipaas-ctrl-0.9.tar
docker load < /home/vagrant/docker-images/gitlab-ce-12.10.1-ce.0.tar
docker load < /home/vagrant/docker-images/gitlab-runner-v12.10.1.tar

########################################
# Stop and Disable firewalld
########################################
echo "[TASK 4] Stop and Disable firewalld"
systemctl disable firewalld > /dev/null 2>&1 
systemctl stop firewalld > /dev/null 2>&1 

########################################
# Disable SELinux
########################################
echo "[TASK 5] Disable SELinux"
setenforce 0 > /dev/null 2>&1
sed -i --follow-symlinks 's/^SELINUX=enforcing/SELINUX=disabled/' /etc/sysconfig/selinux

########################################
# Prepare environement & clone multipaas
########################################
echo "[TASK 6] Prepare environement & clone multipaas"
mkdir -p /home/vagrant/.multipaas/nginx/conf.d
mkdir -p /home/vagrant/.multipaas/nginx/letsencrypt
mkdir -p /home/vagrant/.multipaas/postgres/pg-init-scripts
mkdir -p /home/vagrant/.multipaas/gitlab

cp /home/vagrant/multipaas/install/control-plane/pg_resources/create-multiple-postgresql-databases.sh /home/vagrant/.multipaas/postgres/pg-init-scripts
cp /home/vagrant/multipaas/install/control-plane/nginx_resources/nginx.conf /home/vagrant/.multipaas/nginx
cp /home/vagrant/multipaas/install/control-plane/nginx_resources/registry.conf /home/vagrant/.multipaas/nginx/conf.d
cp /home/vagrant/multipaas/install/control-plane/nginx_resources/keycloak.conf /home/vagrant/.multipaas/nginx/conf.d
cp /home/vagrant/multipaas/install/control-plane/nginx_resources/gitlab.conf /home/vagrant/.multipaas/nginx/conf.d
touch /home/vagrant/.multipaas/nginx/conf.d/default.conf
touch /home/vagrant/.multipaas/nginx/conf.d/tcp.conf
mkdir -p /home/vagrant/.multipaas/postgres/data
mkdir -p /home/vagrant/.multipaas/mosquitto/config
mkdir -p /home/vagrant/.multipaas/mosquitto/data
mkdir -p /home/vagrant/.multipaas/mosquitto/log
chown -R vagrant: /home/vagrant/.multipaas

su - vagrant -c 'mkdir -p /home/vagrant/multipaas/tmp'

sed -i "s/<MYCLOUD_API_HOST_PORT>/$API_IP:3030/g" /home/vagrant/.multipaas/nginx/conf.d/registry.conf

########################################
# Set root password
########################################
echo "[TASK 7] Set root password"
echo "kubeadmin" | passwd --stdin vagrant > /dev/null 2>&1

########################################
# Create & mount new partition
########################################
echo "[TASK 8] Create new partition"
echo -e "o\nn\np\n1\n\n\nw" | fdisk /dev/sdb > /dev/null 2>&1

echo "[TASK 9] Mount partition"
mkfs.xfs -i size=512 /dev/sdb1 > /dev/null 2>&1 
mkdir -p /mnt/docker-registry/data
echo '/dev/sdb1 /mnt/docker-registry/data xfs defaults 1 2' >> /etc/fstab
mount -a > /dev/null 2>&1 
mount > /dev/null 2>&1 

########################################
# Enable ssh password authentication
########################################
echo "[TASK 10] Enable ssh password authentication"
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl reload sshd > /dev/null 2>&1

########################################
# Preparing certificates for NGinx
########################################
echo "[TASK 11] Preparing certificates for NGinx"
NGINX_CRT_FOLDER=/opt/docker/containers/nginx/certs
NGINX_USERS_CRT_FOLDER=/opt/docker/containers/nginx/certs/users
mkdir -p $NGINX_CRT_FOLDER
mkdir -p $NGINX_USERS_CRT_FOLDER
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

########################################
# Update hosts file
########################################
echo "[TASK 12] Update hosts file"
sed '/multipaas.com/d' /etc/hosts
echo "$API_IP multipaas.com multipaas.registry.com registry.multipaas.org multipaas.keycloak.com multipaas.gitlab.com multipaas.static.com" >> /etc/hosts

########################################
# Start Docker registry
########################################
echo "[TASK 13] Start Docker registry"
mkdir -p /opt/docker/containers/docker-registry/auth
mkdir -p /opt/docker/containers/nginx-registry/auth

# touch /opt/docker/containers/docker-registry/auth/htpasswd
# touch /opt/docker/containers/nginx-registry/auth/htpasswd

# docker run --entrypoint htpasswd registry:2.7.1 -Bbn multipaas_master_user multipaas_master_pass > /opt/docker/containers/docker-registry/auth/htpasswd > /dev/null 2>&1 
# docker run --entrypoint htpasswd registry:2.7.1 -bn multipaas_master_user multipaas_master_pass > /opt/docker/containers/nginx-registry/auth/htpasswd > /dev/null 2>&1 


DR_CRED=$(docker run --entrypoint htpasswd registry:2.7.1 -Bbn multipaas_master_user multipaas_master_pass)
NR_CRED=$(docker run --entrypoint htpasswd registry:2.7.1 -bn multipaas_master_user multipaas_master_pass)

cat > /opt/docker/containers/docker-registry/auth/htpasswd << EOF
$DR_CRED
EOF

cat > /opt/docker/containers/nginx-registry/auth/htpasswd << EOF
$NR_CRED
EOF

su - vagrant -c '
docker run -d \
    --name multipaas-registry \
    --restart=always -p 5000:5000 \
    -v /mnt/docker-registry/data/:/var/lib/registry \
    -v /opt/docker/containers/docker-registry/auth:/auth \
    -e "REGISTRY_AUTH=htpasswd" \
    -e "REGISTRY_AUTH_HTPASSWD_REALM=Registry Realm" \
    -e REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd \
    -e REGISTRY_STORAGE_DELETE_ENABLED=true \
    -v '"$NGINX_CRT_FOLDER"':/certs \
    -e REGISTRY_HTTP_TLS_CERTIFICATE=/certs/docker-registry.crt \
    -e REGISTRY_HTTP_TLS_KEY=/certs/docker-registry.key \
    registry:2.7.1
' > /dev/null 2>&1

########################################
# Start PostgreSQL
########################################
echo "[TASK 14] Start PostgreSQL"
su - vagrant -c '
docker run -d \
    --name multipaas-postgresql \
    --restart unless-stopped \
    --network host \
    -v /home/vagrant/.multipaas/postgres/data:/var/lib/postgresql/data \
    -v /home/vagrant/.multipaas/postgres/pg-init-scripts:/docker-entrypoint-initdb.d \
    -e POSTGRES_PASSWORD='"$POSTGRES_PASSWORD"' \
    -e KEYCLOAK_USER=keycloak \
    -e KEYCLOAK_PASS='"$KEYCLOAK_PASSWORD"' \
    -e MYCLOUD_USER=multipaas \
    -e MYCLOUD_PASS=multipaaspass \
    postgres:12.2-alpine
' > /dev/null 2>&1

sleep 15 # Give time to Postgres to start and init DB

########################################
# Start Keycloak
########################################
echo "[TASK 15] Start Keycloak"
su - vagrant -c '
docker run -d \
    --name multipaas-keycloak \
    --restart=always -p 8888:8080 \
    -e DB_VENDOR=POSTGRES \
    -e KEYCLOAK_PASSWORD='"$KEYCLOAK_PASSWORD"' \
    -e KEYCLOAK_USER=admin \
    -e DB_DATABASE=keycloak \
    -e DB_PORT=5432 \
    -e DB_USER=keycloak \
    -e DB_PASSWORD='"$KEYCLOAK_PASSWORD"' \
    -e DB_ADDR='"$DB_HOST"' \
    -e PROXY_ADDRESS_FORWARDING=true \
    jboss/keycloak:9.0.3
' > /dev/null 2>&1

########################################
# Start NGinx
########################################
echo "[TASK 16] Start NGinx"
su - vagrant -c '
docker run -d \
    --name multipaas-nginx \
    --restart unless-stopped \
    --network host \
    -v /home/vagrant/.multipaas/nginx/conf.d:/etc/nginx/conf.d:ro \
    -v /home/vagrant/.multipaas/nginx/nginx.conf:/etc/nginx/nginx.conf \
    -v /home/vagrant/.multipaas/nginx/letsencrypt:/etc/letsencrypt \
    -v /opt/docker/containers/nginx-registry/auth:/auth \
    -v /home/vagrant/multipaas/install/build/offline_files:/www/static \
    -v '"$NGINX_CRT_FOLDER"':/certs \
    nginx:1.17.10-alpine
' > /dev/null 2>&1

########################################
# Start Mosquitto
########################################
echo "[TASK 17] Start Mosquitto"
su - vagrant -c 'touch /home/vagrant/.multipaas/mosquitto/log/mosquitto.log'
chmod o+w /home/vagrant/.multipaas/mosquitto/log/mosquitto.log
chown 1883:1883 /home/vagrant/.multipaas/mosquitto/log -R
su - vagrant -c '
docker run -d \
    --name multipaas-mosquitto \
    --restart unless-stopped \
    --network host \
    -v /home/vagrant/.multipaas/postgres/data:/mosquitto/data \
    -v /home/vagrant/.multipaas/postgres/log:/mosquitto/log \
    -v /etc/localtime:/etc/localtime \
    eclipse-mosquitto:1.6
' > /dev/null 2>&1

########################################
# Install MultiPaaS API Server
########################################
echo "[TASK 18] Install MultiPaaS API Server"
su - vagrant -c '
docker run -d \
    --name multipaas-api \
    --restart unless-stopped \
    --network host \
    -e NGINX_HOST_IP='"$NGINX_HOST_IP"' \
    -e DB_HOST='"$DB_HOST"' \
    -e DB_USER='"$POSTGRES_USER"' \
    -e DB_PASS='"$DB_PASS"' \
    -e MOSQUITTO_IP='"$MOSQUITTO_IP"' \
    -e API_SYSADMIN_USER='"$API_SYSADMIN_USER"' \
    -e API_SYSADMIN_PASSWORD='"$API_SYSADMIN_PASSWORD"' \
    -e REGISTRY_IP='"$REGISTRY_IP"' \
    -e CRYPTO_KEY=YDbxyG16Q6ujlCpjXH2Pq7nPAtJF66jLGwx4RYkHqhY= \
    -e ENABLE_NGINX_STREAM_DOMAIN_NAME=true \
    -e MP_SERVICES_DIR=/usr/src/app/data/mp_services \
    -v /home/vagrant/multipaas:/usr/src/app/data \
    -v /opt/docker/containers/docker-registry/auth:/usr/src/app/auth-docker \
    -v /opt/docker/containers/nginx-registry/auth:/usr/src/app/auth-nginx \
    multipaas-api:0.9
' > /dev/null 2>&1

########################################
# Install MultiPaaS task controller
########################################
echo "[TASK 19] Install MultiPaaS task controller"
su - vagrant -c '
docker run -d \
    --name multipaas-ctrl \
    --restart unless-stopped \
    --network host \
    -e DB_HOST='"$DB_HOST"' \
    -e DB_USER='"$POSTGRES_USER"' \
    -e DB_PASS='"$DB_PASS"' \
    -e MOSQUITTO_IP='"$MOSQUITTO_IP"' \
    -e NGINX_HOST_IP='"$NGINX_HOST_IP"' \
    -e ENABLE_NGINX_STREAM_DOMAIN_NAME=true \
    -e DHCP_OVERWRITE=true \
    -e DHCP_MASK='"$DHCP_MASK"' \
    -e DHCP_RESERVED='"$DHCP_RESERVED"' \
    -e DHCT_USE_PING=true \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v /home/vagrant/.multipaas/nginx:/usr/src/app/nginx \
    -v '"$NGINX_USERS_CRT_FOLDER"':/certs \
    multipaas-ctrl:0.9
' > /dev/null 2>&1

########################################
# Generate client registry setup script
########################################
echo "[TASK 20] Generate client registry setup script"
CRT="$(cat $NGINX_CRT_FOLDER/docker-registry.crt)"
CRT_NGINX="$(cat $NGINX_CRT_FOLDER/nginx-registry.crt)"

echo "#!/bin/bash"  >> /home/vagrant/configPrivateRegistry.sh
echo "mkdir -p /etc/docker/certs.d/multipaas.registry.com:5000" >> /home/vagrant/configPrivateRegistry.sh
echo "cat <<EOT >> /etc/docker/certs.d/multipaas.registry.com:5000/ca.crt" >> /home/vagrant/configPrivateRegistry.sh
echo "$CRT"  >> /home/vagrant/configPrivateRegistry.sh
echo "EOT"  >> /home/vagrant/configPrivateRegistry.sh
echo "mkdir -p /etc/docker/certs.d/registry.multipaas.org" >> /home/vagrant/configPrivateRegistry.sh
echo "cat <<EOT >> /etc/docker/certs.d/registry.multipaas.org/ca.crt" >> /home/vagrant/configPrivateRegistry.sh
echo "$CRT_NGINX"  >> /home/vagrant/configPrivateRegistry.sh
echo "EOT"  >> /home/vagrant/configPrivateRegistry.sh
echo "systemctl stop docker && systemctl start docker"  >> /home/vagrant/configPrivateRegistry.sh

chown vagrant: /home/vagrant/configPrivateRegistry.sh
chmod +x /home/vagrant/configPrivateRegistry.sh