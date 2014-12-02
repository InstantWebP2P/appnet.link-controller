// iWebPP.IO name-server example
// Copyright (c) 2012 Tom Zhou<zs68j2ee@gmail.com>
//
var fs = require('fs');
var nmSrv = require('../iwebpp.io-server');

var nmsrvs = new nmSrv(
    // endpoint info
    {
            dn: 'ruyier.com',                     // name server domain name, change to yours
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


// check Taobao buyer's usrkey database
var taobao = require('./taobao/auth');
var usages = {};

nmsrvs.on('NS.SEP.SEP_OPC_SDP_OFFER', function(data){
    ///console.log('NS.SEP.SEP_OPC_SDP_OFFER:'+JSON.stringify(data.data));

        
    // check taobao user accounting
    if (data.data.offer.usrkey) {
        taobao.check(data.data.offer.usrkey, function(err, entry){
            if (err) {
                ///console.log('close name-client...'+JSON.stringify(data.client.clntinfo));
                if (data.client && data.client.close) data.client.close();
            } else {
                // close after expired
                if (data.client && data.client.close) {
                    // test usrkey expire after 10mins
                    if (data.data.offer.usrkey === 'taobao:test6868') {
                        data.client.ttlTimeout = setTimeout(function(){
                            if (data.client && data.client.close) data.client.close();
                            console.log('ttl timeout '+data.data.offer.usrkey);
                        }, 10*60*1000); // TTL 10mins
                    } else {
                        ///console.log('ttl '+(entry.to - Date.now()));
                        
                        // check ttl < 24days due to setTimeout limitation
                        var ttltmo = entry.to - Date.now();
                        if (ttltmo > 0 && ttltmo < 0x7fffffff) {
                            data.client.ttlTimeout = setTimeout(function(){
                                if (data.client && data.client.close) data.client.close();
                                console.log('ttl timeout '+data.data.offer.usrkey);
                            }, ttltmo); // TTL
                        }

                        // check usage count
                        // every usrkey only allow 4 online 
                        usages[data.data.offer.usrkey] = usages[data.data.offer.usrkey] || 0;
                        usages[data.data.offer.usrkey] += 1;

                        if (usages[data.data.offer.usrkey] > 8) {
                            data.client.close();    
                            console.log('usages exceeded '+data.data.offer.usrkey);
                        }
                    }

                    // cleanup on closure 
                    data.client.once('close', function(){
                        if (data.client.ttlTimeout) clearTimeout(data.client.ttlTimeout);

                        if (usages[data.data.offer.usrkey]) usages[data.data.offer.usrkey] -= 1;
                    });

                    data.client.once('error', function(){
                        if (data.client.ttlTimeout) clearTimeout(data.client.ttlTimeout);
                            
                        if (usages[data.data.offer.usrkey]) usages[data.data.offer.usrkey] -= 1;
                    });
 
                }
            }
        });
    } else {
        ///console.log('close name-client...'+JSON.stringify(data.client.clntinfo));
        if (data.client && data.client.close) data.client.close();
    }
  
});

nmsrvs.on('AS.client.close', function(data){
    ///console.log('AS.client.close:'+JSON.stringify(data.clntinfo));
});



