#!/bin/bash

C_IP=$1

# Configure kubelet IP since running in VB
# sed -i '9iEnvironment="KUBELET_EXTRA_ARGS=--network-plugin=cni --cni-conf-dir=/etc/cni/net.d --cni-bin-dir=/opt/cni/bin"' /usr/lib/systemd/system/kubelet.service.d/10-kubeadm.conf
M_IP="$(cat /etc/sysconfig/network-scripts/ifcfg-eth1 | grep IPADDR= | cut -d'=' -f2)"
rm -rf /etc/sysconfig/kubelet
echo "KUBELET_EXTRA_ARGS=--node-ip=$M_IP" >> /etc/sysconfig/kubelet

# Start and Enable kubelet service
echo "[TASK 8] Enable and start kubelet service"
systemctl enable kubelet 
systemctl start kubelet 

echo "[TASK 9] Configuring Docker registry on IP $C_IP"
sshpass -p 'kubeadmin' sudo scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no vagrant@$C_IP:/home/vagrant/configPrivateRegistry.sh /configPrivateRegistry.sh
/configPrivateRegistry.sh

echo "[TASK 10] Installing required docker images"
for dockerimage in /home/vagrant/docker-images/*.tar; do
   docker load --input $dockerimage
done
# docker load --input /home/vagrant/docker-images/coredns-1.6.7.tar
# docker load --input /home/vagrant/docker-images/etcd-3.4.3-0.tar
# docker load --input /home/vagrant/docker-images/flannel-v0.12.0-amd64.tar
# docker load --input /home/vagrant/docker-images/kube-apiserver-v1.18.2.tar
# docker load --input /home/vagrant/docker-images/kube-controller-manager-v1.18.2.tar
# docker load --input /home/vagrant/docker-images/kube-proxy-v1.18.2.tar
# docker load --input /home/vagrant/docker-images/kube-scheduler-v1.18.2.tar
# docker load --input /home/vagrant/docker-images/nginx-ingress-1.7.0.tar
# docker load --input /home/vagrant/docker-images/pause-3.2.tar

# Initialize Kubernetes cluster
echo "[TASK 11] Initialize Kubernetes Cluster"
echo "Initializing kubeadm on IP $M_IP"
# kubeadm init --apiserver-advertise-address=$M_IP --pod-network-cidr=192.168.0.0/16
kubeadm init --apiserver-advertise-address=$M_IP --pod-network-cidr=10.244.0.0/16

echo "[TASK 12] Configuring Keycloak"
sshpass -p 'kubeadmin' sudo scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no vagrant@$C_IP:/opt/docker/containers/nginx/certs/rootCA.crt /etc/kubernetes/pki/rootCA.crt

# Copy Kube admin config
echo "[TASK 13] Copy kube admin config to Vagrant user .kube directory"
mkdir /home/vagrant/.kube
cp /etc/kubernetes/admin.conf /home/vagrant/.kube/config
chown -R vagrant:vagrant /home/vagrant/.kube

cp /etc/kubernetes/admin.conf /home/vagrant/.kube/
chown vagrant:vagrant /home/vagrant/.kube/admin.conf
echo "export KUBECONFIG=/home/vagrant/.kube/admin.conf" | tee -a ~/.bashrc
source ~/.bashrc

# Deploy flannel network
echo "[TASK 14] Deploy Flannel network"
# su - vagrant -c "kubectl create -f https://docs.projectcalico.org/v3.9/manifests/calico.yaml"
su - vagrant -c "kubectl apply -f /home/vagrant/k8s_templates/kube-flannel.yml"

# Enable PodPresets
sed -i "s/enable-admission-plugins=NodeRestriction/enable-admission-plugins=NodeRestriction,PodPreset/g" /etc/kubernetes/manifests/kube-apiserver.yaml
sed -i '/- kube-apiserver/a\ \ \ \ - --runtime-config=settings.k8s.io/v1alpha1=true' /etc/kubernetes/manifests/kube-apiserver.yaml

# Configure OpenID Connect for Keycloak
sed -i '/- kube-apiserver/a\ \ \ \ - --oidc-issuer-url=https://multipaas.keycloak.com/auth/realms/master' /etc/kubernetes/manifests/kube-apiserver.yaml
sed -i '/- kube-apiserver/a\ \ \ \ - --oidc-groups-claim=groups' /etc/kubernetes/manifests/kube-apiserver.yaml
sed -i '/- kube-apiserver/a\ \ \ \ - --oidc-username-claim=email' /etc/kubernetes/manifests/kube-apiserver.yaml
sed -i '/- kube-apiserver/a\ \ \ \ - --oidc-client-id=kubernetes-cluster' /etc/kubernetes/manifests/kube-apiserver.yaml
sed -i '/- kube-apiserver/a\ \ \ \ - --oidc-ca-file=/etc/kubernetes/pki/rootCA.crt' /etc/kubernetes/manifests/kube-apiserver.yaml

/home/vagrant/gentoken.sh

echo "$C_IP multipaas.com multipaas.keycloak.com multipaas.registry.com docker-registry registry.multipaas.org multipaas.static.com" >> /etc/hosts

# Enable k8s deployment logger
cat > /k8s_event_logger.sh <<'EOF'
#!/bin/bash

m_dep() {
    kubectl get deployments --all-namespaces --watch -o wide 2>&1 | cluster_deployment_event_logger
}
m_rep() {
    kubectl get statefulsets --all-namespaces --watch -o wide 2>&1 | cluster_statefullset_event_logger
}
cluster_deployment_event_logger() {
    while read IN
    do
        LWC=$(echo "$IN" | awk '{print tolower($0)}')
        mosquitto_pub -h <MQTT_IP> -t /multipaas/cluster/event/$HOSTNAME -m "D:$LWC"
    done
    m_dep
}
cluster_statefullset_event_logger() {
    while read IN
    do
        LWC=$(echo "$IN" | awk '{print tolower($0)}')
        mosquitto_pub -h <MQTT_IP> -t /multipaas/cluster/event/$HOSTNAME -m "S:$LWC"
    done
    m_rep
}
sleep 20
m_dep
m_rep
EOF

chmod a+wx /k8s_event_logger.sh
sed -i "s/<MQTT_IP>/$C_IP/g" /k8s_event_logger.sh

cat > /etc/systemd/system/multipaasevents.service <<'EOF'
[Unit]
Description=Multipaas Cluster Event Monitor
After=syslog.target network.target

[Service]
Type=simple
ExecStart=/k8s_event_logger.sh
TimeoutStartSec=0
Restart=always
RestartSec=120
User=vagrant

[Install]
WantedBy=default.target
EOF

systemctl daemon-reload
systemctl enable multipaasevents.service
systemctl start multipaasevents.service