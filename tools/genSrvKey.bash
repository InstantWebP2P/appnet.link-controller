#!/bin/bash

openssl rand -out ${HOME}/.rnd -hex 256
echo "### Generate ${HOME}/.rnd done"

# CA cert Self-Signed
## Need only generate once for one Domain Name
if [ "$2" == "genca" ]; then
    openssl req -x509 -nodes -days 3680 -subj "/C=CN/ST=Shanghai/L=Shanghai/OU=51DESE.com/CN=$1" -newkey rsa:4096 -keyout ./ca-certs/ca-key.pem -out ./ca-certs/ca-cert.pem
    
    echo "### Generate CA cert done"
fi

## Usage: ./genSrvKey.bash domainName [genca: Gen CA cert]

### as
sed "s/tbdcn/$1/gi" ./certs/as-v3.conf.tmpl > ./certs/as-v3.conf

openssl genrsa -out ./certs/as-key.pem 2048
openssl req -new -key ./certs/as-key.pem -subj "/C=CN/ST=Shanghai/L=Shanghai/OU=51DESE.com/CN=$1" -out ./certs/as-csr.pem
openssl x509 -req -days 368 -CA ./ca-certs/ca-cert.pem -CAkey ./ca-certs/ca-key.pem -CAcreateserial -in ./certs/as-csr.pem -out ./certs/as-cert.pem -extensions v3_req -extfile ./certs/as-v3.conf
rm -rf ./certs/as-csr.pem

chmod 444 ./certs/as*.pem
echo "### Generate Agent server cert done"

### ps *.vurl.$1
sed "s/tbdcn/$1/gi" ./certs/ps-v3.conf.tmpl > ./certs/ps-v3.conf

openssl genrsa -out ./certs/ps-key.pem 2048
openssl req -new -key ./certs/ps-key.pem -subj "/C=CN/ST=Shanghai/L=Shanghai/OU=51DESE.com/CN=$1" -out ./certs/ps-csr.pem
openssl x509 -req -days 368 -CA ./ca-certs/ca-cert.pem -CAkey ./ca-certs/ca-key.pem -CAcreateserial -in ./certs/ps-csr.pem -out ./certs/ps-cert.pem -extensions v3_req -extfile ./certs/ps-v3.conf
rm -rf ./certs/ps-csr.pem

chmod 444 ./certs/ps*.pem
echo "### Generate Proxy server cert done"

### ns
sed "s/tbdcn/$1/gi" ./certs/ns-v3.conf.tmpl > ./certs/ns-v3.conf

openssl genrsa -out ./certs/ns-key.pem 2048
openssl req -new -key ./certs/ns-key.pem -subj "/C=CN/ST=Shanghai/L=Shanghai/OU=51DESE.com/CN=$1" -out ./certs/ns-csr.pem
openssl x509 -req -days 368 -CA ./ca-certs/ca-cert.pem -CAkey ./ca-certs/ca-key.pem -CAcreateserial -in ./certs/ns-csr.pem -out ./certs/ns-cert.pem -extensions v3_req -extfile ./certs/ns-v3.conf
rm -rf ./certs/ns-csr.pem

chmod 444 ./certs/ns*.pem
echo "### Generate Name server cert done"
