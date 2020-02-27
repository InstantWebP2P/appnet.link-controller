// iWebPP.IO name-server V2 example
// Copyright (c) 2012-present Tom Zhou<iwebpp@gmail.com>
//
var fs = require('fs');
var nmSrv = require('../iwebpp.io-server-v2');

var nmsrvs = new nmSrv(
    // endpoint info
    {
            dn: 'iwebpp.com',                     // name server domain name, change to yours
        ipaddr: '0.0.0.0', ports: [52686, 52868], // name server
          turn: [52688, 52866],                   // relay server
	    option: {mbw: 256000}                     // user-specific feature, mbw: maxim bandwidth 256KB/s in default
    },
    
    // SSL/NACL certs
    {
    		/*// SSL certs
    		sslcerts: {
    			// CA cert/key file path
    			ca: {
    				 key: __dirname+'/../ca-certs/ca-key.pem',
    				cert: __dirname+'/../ca-certs/ca-cert.pem',
    				cont: fs.readFileSync(__dirname+'/../ca-certs/ca-cert.pem')       
    			},

    			// Server cert/key
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
    			   cert: fs.readFileSync(__dirname+'/../certs/ps-cert.pem')
    			}
    		},*/

    		// NACL certs
    		naclcerts: {
    			// CA cert/key info file path
    			ca: {
    				 key: JSON.parse(fs.readFileSync(__dirname+'/../ca-certs/nacl-ca-key.json').toString('utf-8')),
    			    cert: JSON.parse(fs.readFileSync(__dirname+'/../ca-certs/nacl-ca-cert.json').toString('utf-8'))
    			},

    			// Server cert/key
    			ns: {
    			     key: JSON.parse(fs.readFileSync(__dirname+'/../certs/nacl-ns-key.json').toString('utf-8')),
    			    cert: JSON.parse(fs.readFileSync(__dirname+'/../certs/nacl-ns-cert.json').toString('utf-8'))
    			},
    			as: {
    				 key: JSON.parse(fs.readFileSync(__dirname+'/../certs/nacl-as-key.json').toString('utf-8')),
                    cert: JSON.parse(fs.readFileSync(__dirname+'/../certs/nacl-as-cert.json').toString('utf-8'))
    			},
    			ps: {
    				 key: JSON.parse(fs.readFileSync(__dirname+'/../certs/nacl-ps-key.json').toString('utf-8')),
                    cert: JSON.parse(fs.readFileSync(__dirname+'/../certs/nacl-ps-cert.json').toString('utf-8'))
    			}
    		}
    }
); 
