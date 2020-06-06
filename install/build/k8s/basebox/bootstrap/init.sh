#!/bin/bash

# Update environment file
cat >>/etc/environment<<EOF
LANG=en_US.utf-8
LC_ALL=en_US.utf-8
EOF

# Add extra repos first
EPEL_EXISTS=$(yum repolist | grep "epel/x86_64")
if [ "$EPEL_EXISTS" == "" ]; then
    echo "==> Adding repo for epel..."
    yum -y install https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm
fi

DOCKER_REPO_EXISTS=$(yum repolist | grep "docker-ce-stable/x86_64")
if [ "$DOCKER_REPO_EXISTS" == "" ]; then
    echo "==> Adding repo for Docker CE..."
    yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
fi

yum -y update

yum install -y yum-utils

WGET_EXISTS=$(command -v wget)
if [ "$WGET_EXISTS" == "" ]; then
    echo "==> Installing wget..."
    yum install -y wget
fi

DOCKER_EXISTS=$(command -v docker)
if [ "$DOCKER_EXISTS" == "" ]; then
    echo "==> Installing Docker..."
    yum install -y docker-ce
    systemctl enable docker
    systemctl start docker
fi

GIT_EXISTS=$(command -v git)
if [ "$GIT_EXISTS" == "" ]; then
    yum -y groupinstall "Development Tools"
    yum -y install wget perl-CPAN gettext-devel perl-devel  openssl-devel zlib-devel expat-devel curl-devel
    export VER="2.9.5"
    wget https://github.com/git/git/archive/v${VER}.tar.gz
    tar -xvf v${VER}.tar.gz
    rm -f v${VER}.tar.gz
    cd git-*
    make install
    cd ..
    rm -rf git-*
    yum -y remove perl-CPAN gettext-devel perl-devel  openssl-devel zlib-devel expat-devel curl-devel
fi
