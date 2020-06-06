#!/bin/bash

yum -y update
yum install -y yum-utils

WGET_EXISTS=$(command -v wget)
if [ "$WGET_EXISTS" == "" ]; then
    echo "==> Installing wget..."
    yum install -y wget
fi

CURL_EXISTS=$(command -v curl)
if [ "$CURL_EXISTS" == "" ]; then
    echo "==> Installing curl..."
    yum install -y curl
fi

if [ ! -f "/etc/yum.repos.d/virtualbox.repo" ]; then
    wget https://download.virtualbox.org/virtualbox/rpm/el/virtualbox.repo
    mv virtualbox.repo /etc/yum.repos.d/
fi

curl -sL https://rpm.nodesource.com/setup_12.x | sudo -E bash -

wget -q https://www.virtualbox.org/download/oracle_vbox.asc
rpm --import oracle_vbox.asc

yum -y update || echo "Oracle key initialized"