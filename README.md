Example of API use:

curl -s -H 'Authorization: Bearer aa' localhost:8000/api/set_test_data


Install

apt install pkg-config
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

=> if run as non-root, it will install home directory and modify ~/.profile to modify the PATH


cargo watch --ignore ui -x run & npm --prefix=ui run dev &


mysql grouper < direct-mrights.sql | perl direct-mrights-to-ldap.pl > direct-mrights.ldif
ldapmodify -c -h ldap-test -f /tmp/direct-mrights.ldif 