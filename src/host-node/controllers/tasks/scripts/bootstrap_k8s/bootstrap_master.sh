#!/bin/bash

yum install unzip -y

cat <<EOT >> /home/vagrant/getnodes.sh
#!/bin/bash
kubectl get nodes | grep 'worker.' | awk '{print \$1}' | rev | cut -d. -f1 | rev | tr '\n' ','
EOT
chmod +x /home/vagrant/getnodes.sh

echo "[TASK M.4] Generate and save cluster join command to /joincluster.sh"
cat <<EOT >> /home/vagrant/gentoken.sh
#!/bin/bash
kubeadm token create --print-join-command > /joincluster.sh
EOT
chmod +x /home/vagrant/gentoken.sh

echo "[TASK M.5] Install third party resources"
echo "export PATH=$PATH:/usr/local/bin/" >> /etc/environment
export PATH=$PATH:/usr/local/bin/
curl https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash







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

/home/vagrant/gentoken.sh