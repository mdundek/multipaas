#!/bin/bash

_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"

cd $_DIR

vagrant up

vagrant ssh -c "sudo systemctl daemon-reload"
vagrant ssh -c "sudo systemctl restart kubelet"

cd "$_PWD"