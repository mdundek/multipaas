#!/bin/bash

apt-get -y update

# Now we can install WGET
WGET_EXISTS=$(command -v wget)
if [ "$WGET_EXISTS" == "" ]; then
    echo "==> Installing wget..."
    apt-get install -y wget
fi

apt -y install curl dirmngr apt-transport-https lsb-release ca-certificates
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -