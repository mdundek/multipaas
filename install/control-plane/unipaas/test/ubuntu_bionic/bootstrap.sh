#!/bin/bash

curl -s -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash

sudo apt install -y docker.io && sudo systemctl start docker && sudo systemctl enable docker && sudo usermod -aG docker $USER