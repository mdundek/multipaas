#!/bin/bash

dependency_dl_exists() {
    local _EXISTS=""
    
    if [ -d "$1" ]; then
        if [ -n "$(ls $1)" ]; then 
            _EXISTS="OK"
            # if [ -d "$1/dependencies" ]; then
            #     if [ -n "$(ls $1/dependencies)" ]; then 
            #         _EXISTS="OK"
            #     fi
            # else
            #     _EXISTS="OK"
            # fi
        fi
    fi
    echo $_EXISTS
}

remove_rpms_686() {
    rm -rf /var/tmp/rpms/$1/*.i686.rpm
}

# Docker-ce
if [ -z "$(dependency_dl_exists /var/tmp/rpms/container-selinux)" ]; then
    mkdir -p /var/tmp/rpms/container-selinux
    cd /var/tmp/rpms/container-selinux
    wget -q http://mirror.centos.org/centos/8/AppStream/x86_64/os/Packages/container-selinux-2.94-1.git1e99f1d.module_el8.1.0+236+34fc7673.noarch.rpm
    # mkdir -p dependencies
    _debs=$(repoquery --requires --resolve container-selinux)
    for i in $_debs; do
        yumdownloader --assumeyes --destdir=./ --resolve $i
    done
    remove_rpms_686 "container-selinux"
fi

# yum install -y --cacheonly --disablerepo=* /var/tmp/rpms/container-selinux/dependencies/*.rpm
yum install -y --cacheonly --disablerepo=* /var/tmp/rpms/container-selinux/*.rpm

if [ -z "$(dependency_dl_exists /var/tmp/rpms/containerd.io)" ]; then
    mkdir -p /var/tmp/rpms/containerd.io
    dnf config-manager --add-repo=https://download.docker.com/linux/centos/docker-ce.repo
    cd /var/tmp/rpms/containerd.io
    wget -q https://download.docker.com/linux/centos/7/x86_64/stable/Packages/containerd.io-1.2.6-3.3.el7.x86_64.rpm
    # mkdir -p dependencies
    for i in $(repoquery --requires --resolve containerd.io); do
        yumdownloader --assumeyes --destdir=./ --resolve $i
    done
    remove_rpms_686 "containerd.io"
fi

yum install -y --cacheonly --disablerepo=* /var/tmp/rpms/containerd.io/dependencies/*.rpm

yum install -y --cacheonly --disablerepo=* /var/tmp/rpms/containerd.io/*.rpm

if [ -z "$(dependency_dl_exists /var/tmp/rpms/docker-ce)" ]; then
    dnf config-manager --add-repo=https://download.docker.com/linux/centos/docker-ce.repo
    mkdir -p /var/tmp/rpms/docker-ce
    cd /var/tmp/rpms/docker-ce
    # mkdir -p dependencies
    for i in $(repoquery --requires --resolve docker-ce); do
        yumdownloader --assumeyes --destdir=./ --resolve $i
    done
    rm -rf ./container-selinux*.rpm
    rm -rf ./containerd.io*.rpm
    yumdownloader --assumeyes --destdir=./ --resolve docker-ce
    remove_rpms_686 "docker-ce"
fi

# Virtualbox
if [ -z "$(dependency_dl_exists /var/tmp/rpms/virtualbox)" ]; then
    mkdir -p /var/tmp/rpms/virtualbox
    cd /var/tmp/rpms/virtualbox

    wget -q https://dl.fedoraproject.org/pub/epel/epel-release-latest-8.noarch.rpm
    yum install -y --cacheonly --disablerepo=* ./epel-release-latest-8.noarch.rpm

    yumdownloader --assumeyes --destdir=/var/tmp/rpms/virtualbox --resolve VirtualBox-6.1
    remove_rpms_686 "virtualbox"
fi

# Vagrant
if [ -z "$(dependency_dl_exists /var/tmp/rpms/vagrant)" ]; then
    mkdir -p /var/tmp/rpms/vagrant
    wget -q https://releases.hashicorp.com/vagrant/2.2.7/vagrant_2.2.7_x86_64.rpm -O /var/tmp/rpms/vagrant/vagrant_2.2.7_x86_64.rpm
fi

# Gitlab runner
if [ -z "$(dependency_dl_exists /var/tmp/rpms/gitlab-runner)" ]; then
    mkdir -p /var/tmp/rpms/gitlab-runner
    wget -q https://gitlab-runner-downloads.s3.amazonaws.com/latest/rpm/gitlab-runner_amd64.rpm -O /var/tmp/rpms/gitlab-runner/gitlab-runner_amd64.rpm
fi

# Python2
if [ -z "$(dependency_dl_exists /var/tmp/rpms/python2)" ]; then
    mkdir -p /var/tmp/rpms/python2
    for i in $(repoquery --requires --resolve python2-setuptools-wheel); do
        yumdownloader --assumeyes --destdir=/var/tmp/rpms/python2/ --resolve $i
    done
    yumdownloader --assumeyes --destdir=/var/tmp/rpms/python2/ --resolve python2-setuptools-wheel
    for i in $(repoquery --requires --resolve python2-pip-wheel); do
        yumdownloader --assumeyes --destdir=/var/tmp/rpms/python2/ --resolve $i
    done
    yumdownloader --assumeyes --destdir=/var/tmp/rpms/python2/ --resolve python2-pip-wheel
    for i in $(repoquery --requires --resolve python2); do
        yumdownloader --assumeyes --destdir=/var/tmp/rpms/python2/ --resolve $i
    done
    yumdownloader --assumeyes --destdir=/var/tmp/rpms/python2/ --resolve python2
    remove_rpms_686 "python2"
fi

download_rpm() {
    if [ ! -d "/var/tmp/rpms/$1" ]; then
        mkdir -p /var/tmp/rpms/$1
    fi

    if [ -z "$(ls /var/tmp/rpms/$1)" ]; then 
        echo "==> Downloading package $1"
        cd /var/tmp/rpms/$1
        for i in $(repoquery --requires --resolve $1); do
            yumdownloader --assumeyes --destdir=./ --resolve $i
        done
        yumdownloader --assumeyes --destdir=./ --resolve $1
        remove_rpms_686 "$1"
    else
        echo "==> $1 already present, skipping download"
    fi
}

# yum install -y centos-release-gluster

IFS=$'\r\n' GLOBIGNORE='*' command eval  'RPM_LIST=($(cat /var/tmp/rpms/rpm-list.cfg))'
for PACKAGE in "${RPM_LIST[@]}"; do :
    if [[ "$PACKAGE" =~ ^#.*  ]]; then
        echo "==> Skipping rpm $PACKAGE"
    else
        download_rpm $PACKAGE
    fi
done

cd $_CPWD