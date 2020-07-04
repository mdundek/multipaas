#!/bin/bash

EPEL_REPO_PRESENT=$(yum repolist epel | grep "Extra Packages for Enterprise Linux 7")
if [ "$EPEL_REPO_PRESENT" == "" ]; then
    sudo yum -y install https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm
fi
RH7EXTRA_REPO_PRESENT=$(yum repolist "Red Hat Enterprise Linux 7 Server - Extras (RPMs)" | grep "rhel-7-server-extras-rpms/x86_64")
if [ "$RH7EXTRA_REPO_PRESENT" == "" ]; then
    sudo subscription-manager repos --enable=rhel-7-server-extras-rpms
    
fi
DOCKER_REPO_PRESENT=$(yum repolist "Docker CE Stable - x86_64" | grep "docker-ce-stable/x86_64")
if [ "$DOCKER_REPO_PRESENT" == "" ]; then
    sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    
fi
RUNNER_REPO_PRESENT=$(yum repolist runner_gitlab-runner | grep "runner_gitlab-runner/x86_64")
if [ "$RUNNER_REPO_PRESENT" == "" ]; then
    curl -s -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.rpm.sh | sudo bash
fi
sudo yum update -y
sudo yum install epel-release -y

sudo yum install -y docker-ce && sudo usermod -aG docker ${USER} && sudo systemctl start docker && sudo systemctl enable docker