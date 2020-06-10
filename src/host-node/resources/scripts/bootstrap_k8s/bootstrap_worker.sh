#!/bin/bash

C_IP=$1

echo "[TASK 1] Installing required docker images"
for dockerimage in /home/vagrant/docker-images/*.tar; do
   docker load --input $dockerimage
done
# docker load --input /home/vagrant/docker-images/coredns-1.6.7.tar
# docker load --input /home/vagrant/docker-images/etcd-3.4.3-0.tar
# docker load --input /home/vagrant/docker-images/flannel-v0.12.0-amd64.tar
# docker load --input /home/vagrant/docker-images/kube-apiserver-v1.18.2.tar
# docker load --input /home/vagrant/docker-images/kube-controller-manager-v1.18.2.tar
# docker load --input /home/vagrant/docker-images/kube-proxy-v1.18.2.tar
# docker load --input /home/vagrant/docker-images/kube-scheduler-v1.18.2.tar
# docker load --input /home/vagrant/docker-images/nginx-ingress-1.6.3.tar
# docker load --input /home/vagrant/docker-images/pause-3.2.tar

WIP="$(cat /etc/sysconfig/network-scripts/ifcfg-eth1 | grep IPADDR= | cut -d'=' -f2)"
cat <<EOT >> /config_kublet_ip.sh
#!/bin/bash
sed -i "s/--network-plugin=cni/--network-plugin=cni --node-ip=$WIP/g" /var/lib/kubelet/kubeadm-flags.env
EOT
chmod +x /config_kublet_ip.sh

sed '/multipaas.com/d' /etc/hosts
echo "$C_IP multipaas.com multipaas.keycloak.com multipaas.registry.com docker-registry registry.multipaas.org multipaas.static.com" >> /etc/hosts

# # Set up IP updater on boot
# cat > /report_ip.sh << \ENDOFFILE
# #!/bin/bash

# HN=$(hostname)
# LIP=$(cat /etc/sysconfig/network-scripts/ifcfg-eth1 | grep IPADDR= | cut -d'=' -f2)

# curl -s -k \
#     -H "Content-Type: application/json" \
#     -X POST \
#     -d '{"action": "hostip", "params": { "hostname": "'"$HN"'","value":"'"$LIP"'"}}' \
#     http://multipaas.com:3030/cli
# ENDOFFILE
# chmod +x /report_ip.sh

# cat > /etc/systemd/system/mpipupd.service << ENDOFFILE
# [Unit]
# Description=Update node host IP to MultiPaaS API server
# After=network.target

# [Service]
# Type=simple
# ExecStart=/report_ip.sh
# TimeoutStartSec=0

# [Install]
# WantedBy=default.target
# ENDOFFILE

# systemctl daemon-reload
# systemctl enable mpipupd.service
# systemctl start mpipupd.service