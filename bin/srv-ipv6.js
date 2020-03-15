// iWebPP.IO name-server IPv6 example
// Copyright (c) 2012-present Tom Zhou<iwebpp@gmail.com>
//

var fs = require('fs');
var nmSrv = require('../iwebpp.io-server');

var nmsrvs = new nmSrv(
    // endpoint info
    {
            dn: '51dese.com',                     // name server domain name, change to yours
        ipaddr: '0.0.0.0', ports: [51686, 51868], // name server
          turn: [51688, 51866],                   // relay server
        option: {mbw: 32000}                      // user-specific feature, mbw: maxim bandwidth 32KB/s in default
    },
    
    // SSL certs
    {
        ns: {
             key: fs.readFileSync(__dirname+'/../certs/ns-key.pem').toString(),
            cert: fs.readFileSync(__dirname+'/../certs/ns-cert.pem').toString()
        },
        as: {
             key: fs.readFileSync(__dirname+'/../certs/as-key.pem').toString(),
            cert: fs.readFileSync(__dirname+'/../certs/as-cert.pem').toString()
        },
        ps: {
             key: fs.readFileSync(__dirname+'/../certs/ps-key.pem').toString(),
            cert: fs.readFileSync(__dirname+'/../certs/ps-cert.pem').toString()
        }
    }    
); 

nmsrvs.on('error', function (err) {
    console.log('name server error: ' + err);
});

process.on('uncaughtException', function (e) {
    console.log('name server exception: ' + e);
});