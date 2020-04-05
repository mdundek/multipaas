#!/bin/bash

# Update environment file
cat >>/etc/environment<<EOF
LANG=en_US.utf-8
LC_ALL=en_US.utf-8
EOF

# Install docker from Docker-ce repository
echo "[TASK 1] Install docker container engine"
yum install -y -q yum-utils device-mapper-persistent-data lvm2 sshpass centos-release-gluster glusterfs-server
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 
yum install -y -q docker-ce >/dev/null 

usermod -aG docker vagrant

# Enable docker service
echo "[TASK 2] Enable and start docker service"
systemctl enable docker >/dev/null 
systemctl start docker

# Disable SELinux
echo "[TASK 3] Disable SELinux"
setenforce 0
sed -i --follow-symlinks 's/^SELINUX=enforcing/SELINUX=disabled/' /etc/sysconfig/selinux

# Stop and disable firewalld
# echo "[TASK 4] Stop and Disable firewalld"
systemctl disable firewalld
systemctl stop firewalld

# Add sysctl settings
echo "[TASK 4] Add sysctl settings"
cat >>/etc/sysctl.d/kubernetes.conf<<EOF
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
EOF
sysctl --system >/dev/null 

# Disable swap
echo "[TASK 5] Disable and turn off SWAP"
sed -i '/swap/d' /etc/fstab
swapoff -a

# Add yum repo file for Kubernetes
echo "[TASK 6] Add yum repo file for kubernetes"
cat >>/etc/yum.repos.d/kubernetes.repo<<EOF
[kubernetes]
name=Kubernetes
baseurl=https://packages.cloud.google.com/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg
        https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
EOF

# Install Kubernetes
echo "[TASK 7] Install Kubernetes (kubeadm, kubelet and kubectl)"
yum install -y -q kubeadm kubelet kubectl

# Enable ssh password authentication
echo "[TASK 9] Enable ssh password authentication"
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl reload sshd

# Set Root password
echo "[TASK 10] Set root password"
echo "kubeadmin" | passwd --stdin vagrant

# Update vagrant user's bashrc file
echo "export TERM=xterm" >> /etc/bashrc

# Install Gluster client
systemctl disable glusterd
systemctl stop glusterd





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