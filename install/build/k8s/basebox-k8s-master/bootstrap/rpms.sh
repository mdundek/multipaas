#!/bin/bash

# Update environment file
cat >>/etc/environment<<EOF
LANG=en_US.utf-8
LC_ALL=en_US.utf-8
EOF

K8S_REPO_EXISTS=$(yum repolist | grep "kubernetes")
if [ "$K8S_REPO_EXISTS" == "" ]; then
    echo "==> Adding repo for Kubernetes..."
    cat <<EOF > /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://packages.cloud.google.com/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
EOF
fi

if [ ! -d "/var/tmp/rpms/gitlab-runner" ]; then
    mkdir /var/tmp/rpms/gitlab-runner
fi
if [ -z "$(ls /var/tmp/rpms/gitlab-runner)" ]; then 
    wget https://gitlab-runner-downloads.s3.amazonaws.com/latest/rpm/gitlab-runner_amd64.rpm -O /var/tmp/rpms/gitlab-runner/gitlab-runner_amd64.rpm
fi

download_rpm() {
    if [ ! -d "/var/tmp/rpms/$1" ]; then
        mkdir /var/tmp/rpms/$1
    fi
    if [ -z "$(ls /var/tmp/rpms/$1)" ]; then 
        echo "==> Downloading package $1"
        yumdownloader --assumeyes --destdir=/var/tmp/rpms/$1 --resolve $1
    else
        echo "==> $1 already present, skipping download"
    fi
}

yum install -y centos-release-gluster

IFS=$'\r\n' GLOBIGNORE='*' command eval  'RPM_LIST=($(cat /var/tmp/rpms/rpm-list.cfg))'
for PACKAGE in "${RPM_LIST[@]}"; do :
    if [[ "$PACKAGE" =~ ^#.*  ]]; then
        echo "==> Skipping rpm $PACKAGE"
    else
        download_rpm $PACKAGE
    fi
done