#!/bin/bash

# Start and Enable kubelet service
echo "[TASK 8] Enable and start kubelet service"
systemctl enable kubelet 
systemctl start kubelet 