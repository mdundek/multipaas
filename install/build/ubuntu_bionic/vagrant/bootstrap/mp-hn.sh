#!/bin/bash

NODE_EXISTS=$(command -v node)
INSTALL_NODE=0
if [ "$NODE_EXISTS" == "" ]; then
    INSTALL_NODE=1
else
    NV=$(node --version | cut -d'.' -f1)
    if [ "${NV//v}" -lt "12" ]; then
        INSTALL_NODE=1
    fi 
fi
if [ $INSTALL_NODE = 1 ]; then
    apt install -y nodejs
fi

NPM_BUNDLE_EXISTS=$(command -v npm-bundle)
if [ "$NPM_BUNDLE_EXISTS" == "" ]; then
    npm install npm-bundle -g
fi

# Resolve host-node dependencies
mkdir -p /home/vagrant/npm-tmp
rm -rf /home/vagrant/multipaas/src/host-node/node_modules
rm -rf /home/vagrant/multipaas/src/host-node/package-lock.json
cp -r /home/vagrant/multipaas/src/host-node /home/vagrant/npm-tmp
cd /home/vagrant/npm-tmp/host-node
npm i
mv /home/vagrant/npm-tmp/host-node/node_modules /home/vagrant/multipaas/src/host-node/
rm -rf /home/vagrant/npm-tmp/host-node

# Bundle pm2
cd /home/vagrant/npm-tmp
npm-bundle pm2@4.4.0
npm-bundle pm2-logrotate@2.7.0

mv ./pm2-4.4.0.tgz /var/tmp/npm-modules/pm2-4.4.0.tgz
mv ./pm2-logrotate-2.7.0.tgz /var/tmp/npm-modules/pm2-logrotate-2.7.0.tgz
rm -rf /home/vagrant/npm-tmp