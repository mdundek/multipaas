#!/bin/bash

sleep 10

NEEDS_START=$(vboxmanage showvminfo 'multipaas.base' | grep -e ^State | grep 'powered\|saved\|aborted')
if [ "$NEEDS_START" != "" ]; then
    cd <BASE_FOLDER>/install/control-plane && vagrant up --no-provision
fi