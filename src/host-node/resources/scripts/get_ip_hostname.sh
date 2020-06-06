#!/bin/bash

_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"

cd $_DIR && cd ../../workplaces/$1/$2

_MYIP=$(vagrant ssh -c "/sbin/ip -o -4 addr list eth1 | tr -s ' ' | cut -d' ' -f4 | cut -d/ -f1" 2>/dev/null)
_HOSTNAME=$(vagrant ssh -c "hostname" 2>/dev/null)

echo $_MYIP
echo $_HOSTNAME

cd "$_PWD"

