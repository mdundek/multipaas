#!/bin/bash

curl 'http://localhost:3030/accounts/' -H 'Content-Type: application/json' --data-binary '{ "name": "airbus", "email": "mdundek@gmail.com", "password": "airbus" }'