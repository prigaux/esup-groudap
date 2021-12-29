#!/bin/sh

slapd -h "ldap://localhost:2389" -F test-db/config "$@"
