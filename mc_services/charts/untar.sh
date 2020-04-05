#!/bin/bash

FULL_TGZ_PATH="$(pwd)/$1.tgz"
WORKING_DIR="$(pwd)/_$1"

mkdir $WORKING_DIR && cp $FULL_TGZ_PATH $WORKING_DIR && cd $WORKING_DIR
tar -xzvf $FULL_TGZ_PATH -C $(pwd)
rm -rf "$WORKING_DIR/$1.tgz"