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
yum install -y mosquitto

systemctl disable glusterd
systemctl stop glusterd

systemctl disable mosquitto
systemctl stop mosquitto

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

# Enable ssh password authentication
sed -i 's/^PasswordAuthentication no/PasswordAuthentication yes/' /etc/ssh/sshd_config
systemctl reload sshd