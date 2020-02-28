# CA cert Self-Signed
## Need only generate once for one Domain Name
if [ "$2" == "genca" ]; then
    openssl req -x509 -nodes -days 3680 -subj '/C=CN/ST=SH/L=SH/CN=$1' -newkey rsa:4096 -keyout ./ca-certs/ca-key.pem -out ./ca-certs/ca-cert.pem
    echo "### Generate CA cert done"
fi

## Usage: ./genSrvKey.bash domainName [genca: Gen CA cert]
 
### default key/cert
openssl genrsa -out ./certs/$1-key.pem 2048
openssl req -new -key ./certs/$1-key.pem -subj "/C=CN/ST=SH/L=SH/CN=$1" -out ./certs/$1-csr.pem
openssl x509 -req -days 368 -CA ./ca-certs/ca-cert.pem -CAkey ./ca-certs/ca-key.pem -CAcreateserial -in ./certs/$1-csr.pem -out ./certs/$1-cert.pem
rm -rf ./certs/$1-csr.pem

### as
openssl genrsa -out ./certs/as-key.pem 2048
openssl req -new -key ./certs/as-key.pem -subj "/C=CN/ST=SH/L=SH/CN=$1" -out ./certs/as-csr.pem
openssl x509 -req -days 368 -CA ./ca-certs/ca-cert.pem -CAkey ./ca-certs/ca-key.pem -CAcreateserial -in ./certs/as-csr.pem -out ./certs/as-cert.pem -extensions v3_req -extfile ./certs/as-v3.conf
rm -rf ./certs/as-csr.pem

echo "### Generate Agent server cert done"

### ps *.vurl.$1
openssl genrsa -out ./certs/ps-key.pem 2048
openssl req -new -key ./certs/ps-key.pem -subj "/C=CN/ST=SH/L=SH/CN=*.vurl.$1" -out ./certs/ps-csr.pem
openssl x509 -req -days 368 -CA ./ca-certs/ca-cert.pem -CAkey ./ca-certs/ca-key.pem -CAcreateserial -in ./certs/ps-csr.pem -out ./certs/ps-cert.pem -extensions v3_req -extfile ./certs/ps-v3.conf
rm -rf ./certs/ps-csr.pem

echo "### Generate Proxy server cert done"

### ps *.*.vurl.$1
openssl genrsa -out ./certs/ps-key-sub1.pem 2048
openssl req -new -key ./certs/ps-key-sub1.pem -subj "/C=CN/ST=SH/L=SH/CN=*.*.vurl.$1" -out ./certs/ps-csr-sub1.pem
openssl x509 -req -days 368 -CA ./ca-certs/ca-cert.pem -CAkey ./ca-certs/ca-key.pem -CAcreateserial -in ./certs/ps-csr-sub1.pem -out ./certs/ps-cert-sub1.pem  -extensions v3_req -extfile ./certs/ps-v3.conf
rm -rf ./certs/ps-csr-sub1.pem

echo "### Generate Proxy server sub-domain cert done"

### ns
openssl genrsa -out ./certs/ns-key.pem 2048
openssl req -new -key ./certs/ns-key.pem -subj "/C=CN/ST=SH/L=SH/CN=$1" -out ./certs/ns-csr.pem
openssl x509 -req -days 368 -CA ./ca-certs/ca-cert.pem -CAkey ./ca-certs/ca-key.pem -CAcreateserial -in ./certs/ns-csr.pem -out ./certs/ns-cert.pem -extensions v3_req -extfile ./certs/ns-v3.conf
rm -rf ./certs/ns-csr.pem

echo "### Generate Name server cert done"
