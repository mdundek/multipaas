#!/bin/bash

# Update environment file
cat >>/etc/environment<<EOF
LANG=en_US.utf-8
LC_ALL=en_US.utf-8
EOF

# Install Kubernetes
yum install -y --cacheonly --disablerepo=* /var/tmp/rpms/kubeadm/*.rpm
yum install -y --cacheonly --disablerepo=* /var/tmp/rpms/kubelet/*.rpm
yum install -y --cacheonly --disablerepo=* /var/tmp/rpms/kubectl/*.rpm

systemctl start kubelet
kubeadm config images pull
systemctl stop kubelet

# Gitlab runner
rpm -i /var/tmp/rpms/gitlab-runner/gitlab-runner_amd64.rpm
gpasswd -a gitlab-runner docker

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

cat <<EOT >> /home/vagrant/getnodes.sh
#!/bin/bash
kubectl get nodes | grep 'worker.' | awk '{print \$1}' | rev | cut -d. -f1 | rev | tr '\n' ','
EOT
chmod +x /home/vagrant/getnodes.sh

cat <<EOT >> /home/vagrant/gentoken.sh
#!/bin/bash
kubeadm token create --print-join-command > /joincluster.sh
EOT
chmod +x /home/vagrant/gentoken.sh

echo "export PATH=$PATH:/usr/local/bin/" >> /etc/environment
export PATH=$PATH:/usr/local/bin/
curl https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash

# Cleanup
package-cleanup -y --oldkernels --count=1
yum -y autoremove
yum -y remove yum-utils
yum clean all
rm -rf /tmp/*
rm -f /var/log/wtmp /var/log/btmp

cat /dev/null > ~/.bash_history && history -c
history -c