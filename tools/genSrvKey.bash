### CA cert Self-Signed, generate once
#openssl req  -x509 -nodes -days 1868 -subj '/C=CN/ST=SH/L=SH/CN=iwebpp.com' -newkey rsa:4096 -keyout ../ca-certs/ca-key.pem -out ../ca-certs/ca-cert.pem
# or
#openssl genrsa -out ../ca-certs/ca-key.pem 4096  
#openssl req -new -key ../ca-certs/ca-key.pem -subj '/C=CN/ST=SH/L=SH/CN=iwebpp.com' -out ../ca-certs/ca-csr.pem  
#openssl x509 -req -days 3650 -in ../ca-certs/ca-csr.pem -signkey ../ca-certs/ca-key.pem -out ../ca-certs/ca-cert.pem
#rm -rf ../ca-certs/ca-csr.pem


## CLI: ./genSrvKey.bash domainName

### Merge private key with certificate using OpenSSL: http://www.flatmtn.com/article/creating-pkcs12-certificates
#### self-signed: openssl pkcs12 -export -in server.mydomain.org.crt -inkey server.mydomain.key -out mycertificate.pfx
#### ca-signed:   openssl pkcs12 -export -out webrowser-ca-iwebvpn.p12 -inkey webrowser-key.pem -in webrowser-cert.pem  -chain -CAfile ./ca-certs/ca-cert.pem
 
### default key/cert
openssl genrsa -out $1-key.pem 2048
openssl req -new -key $1-key.pem -subj "/C=CN/ST=SH/L=SH/CN=$1" -out $1-csr.pem
openssl x509 -req -days 368 -CA ../ca-certs/ca-cert.pem -CAkey ../ca-certs/ca-key.pem -CAcreateserial -in $1-csr.pem -out $1-cert.pem
rm -rf $1-csr.pem

### as
openssl genrsa -out as-key.pem 2048
openssl req -new -key as-key.pem -subj "/C=CN/ST=SH/L=SH/CN=$1" -out as-csr.pem
openssl x509 -req -days 368 -CA ../ca-certs/ca-cert.pem -CAkey ../ca-certs/ca-key.pem -CAcreateserial -in as-csr.pem -out as-cert.pem -extensions v3_req -extfile as-v3.conf
rm -rf as-csr.pem

### ps *.vurl.$1
openssl genrsa -out ps-key.pem 2048
openssl req -new -key ps-key.pem -subj "/C=CN/ST=SH/L=SH/CN=*.vurl.$1" -out ps-csr.pem
openssl x509 -req -days 368 -CA ../ca-certs/ca-cert.pem -CAkey ../ca-certs/ca-key.pem -CAcreateserial -in ps-csr.pem -out ps-cert.pem -extensions v3_req -extfile ps-v3.conf
rm -rf ps-csr.pem

### ps *.*.vurl.$1
openssl genrsa -out ps-key-sub1.pem 2048
openssl req -new -key ps-key-sub1.pem -subj "/C=CN/ST=SH/L=SH/CN=*.*.vurl.$1" -out ps-csr-sub1.pem
openssl x509 -req -days 368 -CA ../ca-certs/ca-cert.pem -CAkey ../ca-certs/ca-key.pem -CAcreateserial -in ps-csr-sub1.pem -out ps-cert-sub1.pem  -extensions v3_req -extfile ps-v3.conf
rm -rf ps-csr-sub1.pem

### ns
openssl genrsa -out ns-key.pem 2048
openssl req -new -key ns-key.pem -subj "/C=CN/ST=SH/L=SH/CN=$1" -out ns-csr.pem
openssl x509 -req -days 368 -CA ../ca-certs/ca-cert.pem -CAkey ../ca-certs/ca-key.pem -CAcreateserial -in ns-csr.pem -out ns-cert.pem -extensions v3_req -extfile ns-v3.conf
rm -rf ns-csr.pem
