// iWebPP.IO name-server example
// Copyright (c) 2012-present Tom Zhou<iwebpp@gmail.com>
//
var fs = require('fs');
var nmSrv = require('../iwebpp.io-server');

var nmsrvs = new nmSrv(
    // endpoint info
    {
            dn: 'iwebpp.com',                     // name server domain name, change to yours
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
            cont: fs.readFileSync(__dirname+'/../ca-certs/ca-cert.pem')
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


