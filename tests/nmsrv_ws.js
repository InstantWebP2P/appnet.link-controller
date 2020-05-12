'use strict';

// msgpack library
var msgpack = require('msgpack2');

// websocket server listen on 51680
var WebSocketServer = require('ws').Server
    , wss = new WebSocketServer({host: '0.0.0.0', port: 51680});
  
wss.on('connection', function(ws) {
    ws.on('message', function(message, flags) {
        ///JSON.parse(message);
        if (flags.binary == true) {
            var data = msgpack.unpack(message);
            console.log('received: %s', JSON.stringify(data));
        }
        ///ws.send('Pong Hello word @ '+Date.now());
    });
    ws.send('something from server');

    var t = setInterval(function(){
        ///ws.send('pong @'+Date.now());
    }, 2000);
    
    // connection info
    console.log('ws connection info, local address:'+
    JSON.stringify(ws._socket.address())+
    ',remote address:'+JSON.stringify(ws._socket.remoteAddress)+':'+JSON.stringify(ws._socket.remotePort));
});

// websocket server listen on 51688
/*
var wss1 = new WebSocketServer({host: '0.0.0.0', port: 51688});

wss1.on('connection', function(ws) {
    ws.on('message', function(message, flags) {
        ///JSON.parse(message);
        if (flags.binary == true) {
            var data = msgpack.unpack(message);
            console.log('received: %s', JSON.stringify(data));
        }
        ws.send('Pong Hello word @ '+Date.now());
    });
    ws.send('something from server');
    
    // connection info
    console.log('ws connection info, local address:'+
    JSON.stringify(ws._socket.address())+
    ',remote address:'+JSON.stringify(ws._socket.remoteAddress)+':'+JSON.stringify(ws._socket.remotePort));
});
*/

