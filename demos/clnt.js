// Copyright (c) 2012-present Tom Zhou<appnet.link@gmail.com>

var nmSrv = require('../appnet.io-server');
var nmCln = nmSrv.Client;
var SEP = nmSrv.SEP;

var dgram = require("dgram");

// appnet.io-ws library
var WebSocket = require('wspp').wspp;
var WebSocketServer = WebSocket.Server;

// msgpack library
var msgpack = require('msgpack-js');

// vURL
var vURL = require('../vurl');

// clients A/B
var nmclnsB = new nmCln({
    srvinfo: {
        timeout: 20,
        endpoints: [{ip: 'localhost', port: 51686}, {ip: 'localhost', port: 51868}],
        turn: [
            {ip: 'localhost', agent: 51866, proxy: 51688} // every turn-server include proxy and agent port
        ]
    },
    usrinfo: {domain: '51dese.com', usrkey: 'B'},
    conmode: SEP.SEP_MODE_CS,
      vmode: vURL.URL_MODE_PATH
});

// create websocket server with name-client
var creatNmclnWss = function(self) {
    var wss = new WebSocketServer({httpp: true, server: self.bsrv.srv, path: SEP.SEP_CTRLPATH_BS});
    
    wss.on('connection', function(client){    
        console.log('new ws connection: ' +
                    client._socket.remoteAddress+':'+client._socket.remotePort+' -> ' + 
                    client._socket.address().address+':'+client._socket.address().port);
                                
        client.on('message', function(message) {
            var data = (typeof message !== 'string') ? msgpack.decode(message) : JSON.parse(message);
            console.log('business message:'+JSON.stringify(data));
            data += 'reply from '+self.nm;
    
            try {
                client.send(msgpack.encode(data), function(err){
                    if (err) {
                        console.log(err+',sendOpcMsg failed');
                    }
                });
            } catch (e) {
                console.log(e+',sendOpcMsg failed immediately');
            }
        });
    });
}

nmclnsB.on('ready', function(){
    console.log('name-nmclnsB ready');
    this.nm = 'B';
    
    // create websocket server
    creatNmclnWss(this);
});

nmclnsB.on('error', function(err){
    console.log('nmclnsB failed '+err);
});

var nmclnsA = new nmCln({
    srvinfo: {
        timeout: 20,
        endpoints: [{ip: 'localhost', port: 51686}, {ip: 'localhost', port: 51868}], // name-servers
        turn: [
            {ip: 'localhost', agent: 51866, proxy: 51688} // every turn-server include proxy and agent port
        ]
    },
    usrinfo: {domain: '51dese.com', usrkey: 'A'},
    conmode: SEP.SEP_MODE_CS,
      vmode: vURL.URL_MODE_PATH
});

nmclnsA.on('error', function(err){
    console.log('nmclnsA failed '+err);
});

nmclnsA.on('ready', function() {
    console.log('name-nmclnsA ready');
    this.nm = 'A';
    
    // create websocket server
    creatNmclnWss(this);
    
    // ask for all user info
    /*nmclnsA.getAllUsrs(function(err, usrs){
        if (!err) {
            console.log('got all User info answer:'+usrs.length+','+JSON.stringify(usrs));
        } else {
            console.log(err);    
        }
    });*/

    // ask for all Logins info
    /*nmclnsA.getAllLogins(function(err, logins){
        if (!err) {
            console.log('got all Logins answer:'+JSON.stringify(logins));
        } else {
            console.log(err);    
        }
    });*/

    // ask for user-specific Logins info
    nmclnsA.getUsrLogins({domain: '51dese.com', usrkey: 'B'}, function(err, logins){
        if (!err) {
            ///console.log('nmclnsB Logins answer:'+logins.length+','+JSON.stringify(logins));
          
            // ask for client-specific Logins info
            nmclnsA.getClntSdps(logins[logins.length-1].to.gid, function(err, sdps){
                if (!err) {
                    ///console.log('nmclnsB SDPs answer:'+JSON.stringify(sdps));
                                               
                    // try to setup STUN connection to peer
                    var peerinfo = {
                        gid: sdps[sdps.length-1].from.gid, 
                      vpath: sdps[sdps.length-1].from.vpath,
                      vhost: sdps[sdps.length-1].from.vhost,
                      vmode: sdps[sdps.length-1].from.vmode,
                     vtoken: sdps[sdps.length-1].from.vtoken,
                    secmode: sdps[sdps.length-1].from.secmode,
                       
                        lip: sdps[sdps.length-1].from.localIP,
                      lport: sdps[sdps.length-1].from.localPort,
                             
                     natype: sdps[sdps.length-1].from.natype, 
                            
                         ip: sdps[sdps.length-1].rel.clntIP, 
                       port: sdps[sdps.length-1].rel.clntPort
                    };
                    
                    // create STUN session 
                    nmclnsA.offerStun({endpoint: peerinfo}, function(err, stun) {
                        console.log('A setup stun to peer:'+JSON.stringify(peerinfo));
                        
                        if (err || !stun) return console.log(err+',setup STUN to peer failed');
                        
                        // try to connect to peer                                                    
                        nmclnsA.createConnection({endpoint: peerinfo}, function(err, socket){
                            console.log('A connected to peer via STUN:' + JSON.stringify(peerinfo));
                            
                            if (err || !socket) return console.log(err+',connect to peer failed');
                            
                            socket.on('message', function(message) {
                                var data = (typeof message !== 'string') ? msgpack.decode(message) : JSON.parse(message);
                                console.log(JSON.stringify(data));
                            });
                            
                            setInterval(function(){
                                socket.send(msgpack.encode('Hello, This is from test A via STUN :)'));
                            }, 2000);
                        });
                    });
                    
                    // create TURN session
                    nmclnsA.offerTurn({endpoint: peerinfo, sesn: SEP.SEP_SESN_TURN}, function(err, turn){
                        console.log('A setup turn to peer:'+JSON.stringify(peerinfo));
                        ///console.log('TURN:'+JSON.stringify(turn));
                        
                        if (err || !turn) return console.log(err+',setup TURN to peer failed');
                        
                        // try to connect to peer
                        var turninfo = {
                           vpath: turn.vpath,
                           vhost: turn.vhost,
                           vmode: turn.vmode,
                          vtoken: turn.vtoken,
                         secmode: turn.secmode,
                         
                             lip: turn.srvIP,
                           lport: turn.proxyPort,
                            
                              ip: turn.srvIP, 
                            port: turn.proxyPort                        
                        };                                                    
                        nmclnsA.createConnection({endpoint: turninfo, sesn: SEP.SEP_SESN_TURN}, function(err, socket){
                            console.log('A connected to peer via TURN:'+JSON.stringify(turninfo));
                            
                            if (err || !socket) return console.log(err+',connect to turn failed');
                            
                            socket.on('message', function(message) {
                                var data = (typeof message !== 'string') ? msgpack.decode(message) : JSON.parse(message);
                                console.log(JSON.stringify(data));
                            });
                            
                            setInterval(function(){
                                socket.send(msgpack.encode('Hello, This is from test A via TURN :)'));
                            }, 2000);
                        });
                    });
                } else {
                    console.log(err);    
                }
            });
        } else {
            console.log(err);    
        }
    });
});

process.on('uncaughtException', function (e) {
    console.log('name client exception: ' + e);
});
