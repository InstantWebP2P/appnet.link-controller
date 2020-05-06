// AppNet.IO name-server example
// Copyright (c) 2012-present Tom Zhou<appnet.link@gmail.com>
//
var fs    = require('fs');
var nmSrv = require('../appnet.io-server');

// root CA
var vCA = require('ssl-root-cas').create();
vCA.unshift(FS.readFileSync(__dirname + '/../ca-certs/ca-cert.pem'));

var nmsrvs = new nmSrv(
    // endpoint info
    {
            dn: '51dese.com',                     // domain name, change to yours
        ipaddr: '0.0.0.0', ports: [51686, 51868], // name server
          turn: [51688, 51866],                   // relay server
        option: {mbw: 32000}                      // user-specific feature, mbw: maxim bandwidth 32KB/s in default
    },

    // SSL certs
    {
        // CA cert/key file path
        ca: {
             key: __dirname+'/../ca-certs/ca-key.pem',
            cert: __dirname+'/../ca-certs/ca-cert.pem',
            cont: vCA,
        },

        // Server cert/key/ca
        ns: {
             key: fs.readFileSync(__dirname+'/../certs/ns-key.pem'),
            cert: fs.readFileSync(__dirname+'/../certs/ns-cert.pem')
        },
        as: {
             key: fs.readFileSync(__dirname+'/../certs/as-key.pem'),
            cert: fs.readFileSync(__dirname+'/../certs/as-cert.pem')
        },
        ps: {
             key: fs.readFileSync(__dirname+'/../certs/ps-key.pem'),
            cert: fs.readFileSync(__dirname+'/../certs/ps-cert.pem'),
        }
    }
);

nmsrvs.on('error', function (err) {
    console.log('name server error: ' + err);
});

process.on('uncaughtException', function(e){
    console.log('name server exception: ' + e);
});