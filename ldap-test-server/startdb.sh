#!/bin/sh

PATH=$PATH:/usr/sbin

slapd -h "ldap://localhost:2389" -F test-db/config "$@"
