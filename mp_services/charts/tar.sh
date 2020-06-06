#!/bin/bash

FULL_TGZ_PATH="$(pwd)/$1/$1-$2.tgz"
WORKING_DIR="$(pwd)/$1/_$1"

cd $WORKING_DIR
tar -C $(pwd) --exclude="$WORKING_DIR/$1-$2.tgz" -czvf "$FULL_TGZ_PATH" .
rm -rf $WORKING_DIR