#!/bin/bash

# Update environment file
cat >>/etc/environment<<EOF
LANG=en_US.utf-8
LC_ALL=en_US.utf-8
EOF

# Install docker from Docker-ce repository
yum install -y yum-utils
yum install -y lvm2
yum install -y sshpass
yum install -y unzip
yum install -y centos-release-gluster
yum install -y glusterfs-server

rpm -i /var/tmp/rpms/gitlab-runner/gitlab-runner_amd64.rpm
gpasswd -a gitlab-runner docker

systemctl disable glusterd
systemctl stop glusterd

usermod -aG docker vagrant

# Enable docker service
systemctl enable docker >/dev/null 
systemctl start docker

# Disable SELinux
setenforce 0
sed -i --follow-symlinks 's/^SELINUX=enforcing/SELINUX=disabled/' /etc/sysconfig/selinux

# Stop and disable firewalld
# echo "[TASK 4] Stop and Disable firewalld"
systemctl disable firewalld
systemctl stop firewalld

# Add sysctl settings
cat >>/etc/sysctl.d/kubernetes.conf<<EOF
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
EOF
sysctl --system >/dev/null 

# Disable swap
sed -i '/swap/d' /etc/fstab
swapoff -a

# Install Kubernetes
yum install -y --cacheonly --disablerepo=* /var/tmp/rpms/kubeadm/*.rpm
yum install -y --cacheonly --disablerepo=* /var/tmp/rpms/kubelet/*.rpm
yum install -y --cacheonly --disablerepo=* /var/tmp/rpms/kubectl/*.rpm

# Enable ssh password authentication
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl reload sshd

# Set Root password
echo "kubeadmin" | passwd --stdin vagrant

# # Install Gluster client
# echo "[TASK 10] Install Gluster engine"
# yum install -y -q centos-release-gluster glusterfs-server
# systemctl disable glusterd
# systemctl stop glusterd

# Cleanup
package-cleanup -y --oldkernels --count=1
yum -y autoremove
yum -y remove yum-utils
yum clean all
rm -rf /tmp/*
rm -f /var/log/wtmp /var/log/btmp

cat /dev/null > ~/.bash_history && history -c
history -c