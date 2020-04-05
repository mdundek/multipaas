#!/bin/bash

curl 'http://localhost:3030/users/' \
  -H 'Content-Type: application/json' \
  --data-binary '{ "email": "hello3@feathersjs.com", "password": "supersecret" }'