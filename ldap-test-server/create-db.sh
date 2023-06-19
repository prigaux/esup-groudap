#!/bin/sh -e

PATH=$PATH:/usr/sbin

mkdir test-db test-db/var test-db/run test-db/config
for i in minimal/config-core.ldif \
  /etc/ldap/schema/core.ldif \
  /etc/ldap/schema/cosine.ldif \
  /etc/ldap/schema/inetorgperson.ldif \
  /etc/ldap/schema/nis.ldif \
  /etc/ldap/schema/dyngroup.ldif \
  schema/*.ldif; do 
    slapadd -n0 -q -F test-db/config -l $i
done

slapd -h ldapi://ldapi -F test-db/config
sleep 1
ldapadd -x -D "cn=config" -w secret -H ldapi://ldapi -f minimal/add-db.ldif
kill `cat test-db/run/db.pid`

slapadd -n1 -qw -F test-db/config -l minimal/root.ldif
