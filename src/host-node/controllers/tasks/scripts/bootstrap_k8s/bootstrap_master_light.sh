#!/bin/bash

# Configure kubelet IP since running in VB
# sed -i '9iEnvironment="KUBELET_EXTRA_ARGS=--network-plugin=cni --cni-conf-dir=/etc/cni/net.d --cni-bin-dir=/opt/cni/bin"' /usr/lib/systemd/system/kubelet.service.d/10-kubeadm.conf
M_IP="$(hostname -I | cut -d' ' -f2)"
rm -rf /etc/sysconfig/kubelet
echo "KUBELET_EXTRA_ARGS=--node-ip=$M_IP" >> /etc/sysconfig/kubelet

# Start and Enable kubelet service
echo "[TASK 8] Enable and start kubelet service"
systemctl enable kubelet 
systemctl start kubelet 

sshpass -p 'kubeadmin' sudo scp -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no vagrant@192.168.0.98:/home/vagrant/configPrivateRegistry.sh /configPrivateRegistry.sh
/configPrivateRegistry.sh

# Initialize Kubernetes cluster
echo "[TASK M.1] Initialize Kubernetes Cluster"
M_IP="$(hostname -I | cut -d' ' -f2)"
echo "Initializing kubeadm on IP $M_IP"
# kubeadm init --apiserver-advertise-address=$M_IP --pod-network-cidr=192.168.0.0/16
kubeadm init --apiserver-advertise-address=$M_IP --pod-network-cidr=10.244.0.0/16

# Copy Kube admin config
echo "[TASK M.2] Copy kube admin config to Vagrant user .kube directory"
mkdir /home/vagrant/.kube
cp /etc/kubernetes/admin.conf /home/vagrant/.kube/config
chown -R vagrant:vagrant /home/vagrant/.kube

cp /etc/kubernetes/admin.conf /home/vagrant/.kube/
chown vagrant:vagrant /home/vagrant/.kube/admin.conf
echo "export KUBECONFIG=/home/vagrant/.kube/admin.conf" | tee -a ~/.bashrc
source ~/.bashrc

# Deploy flannel network
echo "[TASK M.3] Deploy Calico network"
# su - vagrant -c "kubectl create -f https://docs.projectcalico.org/v3.9/manifests/calico.yaml"
su - vagrant -c "kubectl apply -f https://github.com/coreos/flannel/raw/master/Documentation/kube-flannel.yml"

# Untaint master node
# su - vagrant -c "kubectl taint nodes --all node-role.kubernetes.io/master-"

# Enable PodPresets
sed -i "s/enable-admission-plugins=NodeRestriction/enable-admission-plugins=NodeRestriction,PodPreset/g" /etc/kubernetes/manifests/kube-apiserver.yaml
sed -i '/- kube-apiserver/a\ \ \ \ - --runtime-config=settings.k8s.io/v1alpha1=true' /etc/kubernetes/manifests/kube-apiserver.yaml

/home/vagrant/gentoken.sh