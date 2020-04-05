#!/bin/bash

_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"

cd $_DIR && cd ../../workplaces/$1/$2

_MYIP=$(vagrant ssh -c "hostname -I | cut -d' ' -f2" 2>/dev/null)
_HOSTNAME=$(vagrant ssh -c "hostname" 2>/dev/null)

echo $_MYIP
echo $_HOSTNAME

cd "$_PWD"