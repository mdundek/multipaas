#!/bin/bash

curl 'http://localhost:3030/authentication/' \
  -H 'Content-Type: application/json' \
  --data-binary '{ "strategy": "local", "email": "hello3@feathersjs.com", "password": "supersecret" }'