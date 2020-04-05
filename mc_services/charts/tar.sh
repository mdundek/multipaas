#!/bin/bash

FULL_TGZ_PATH="$(pwd)/$1.tgz"
WORKING_DIR="$(pwd)/_$1"

cd $WORKING_DIR
tar -C $(pwd) --exclude="$WORKING_DIR/$1.tgz" -czvf "$FULL_TGZ_PATH" .
rm -rf $WORKING_DIR