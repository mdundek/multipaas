#!/bin/bash

_DIR="$(cd "$(dirname "$0")" && pwd)"
_PWD="$(pwd)"

cd $_DIR

vagrant up

cd "$_PWD"