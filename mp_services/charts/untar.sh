#!/bin/bash

FULL_TGZ_PATH="$(pwd)/$1/$1-$2.tgz"
WORKING_DIR="$(pwd)/$1/_$1"

mkdir $WORKING_DIR && cp $FULL_TGZ_PATH $WORKING_DIR && cd $WORKING_DIR
tar -xzvf $FULL_TGZ_PATH -C $(pwd)
rm -rf "$WORKING_DIR/$1-$2.tgz"

FILE_COUNT=$(ls | wc -l | xargs)
if [ "$FILE_COUNT" == "1" ]; then
    FOLDER_NAME=$(ls | head -n 1)
    mv ./$FOLDER_NAME/* ./
    rm -rf $FOLDER_NAME
fi