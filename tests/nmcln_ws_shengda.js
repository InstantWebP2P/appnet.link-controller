'use strict';

// msgpack
var msgpack = require('msgpack2');

// SDP offer/answer 
var SDP_OFFER  = 0;
var SDP_ANSWER = 1;


// websocket client 1 connect to 51680
var WebSocket = require('ws');
var ws = new WebSocket('ws://58.215.185.22:51680/vurl', {hole: 51686});

ws.on('open', function() {
    ws.send('something from client');
    
    var t = setInterval(function(){
        ///ws.send('Ping Hello word @ '+Date.now());   
        ///var msg = JSON.stringify({'opc': SDP_OFFER, 'appid': 1});
        var msg = msgpack.pack({'opc': SDP_OFFER, 'appid': 1});
        ws.send(msg, {binary: true});
        console.log("stringify message:"+JSON.stringify(msg));
    }, 2000);

    ws.on('close', function(){
        clearInterval(t);    
    });
});
ws.on('message', function(data, flags) {
    // flags.binary will be set if a binary data is received
    // flags.masked will be set if the data was masked
    var data = (flags.bianry) ? msgpack.unpack(data) : data;
    console.log('received: %s', JSON.stringify(data));

    if (data.opc == SDP_ANSWER) {
        console.log("SDP answer: "+JSON.stringify(data.answer));
    }
});

// websocket client 2 connect to 51688
var ws2 = new WebSocket('ws://58.215.185.22:51688/vurl', {hole: 51686});

ws2.on('open', function() {
    ws2.send('something from client');
    
    var t = setInterval(function(){
        ///ws2.send('Ping Hello word @ '+Date.now());    
        ///var msg = JSON.stringify({'opc': SDP_OFFER, 'appid': 2});
        var msg = msgpack.pack({opc: SDP_OFFER, appid: 2});
        ws2.send(msg, {binary: true});
        console.log("stringify message:"+JSON.stringify(msg));
    }, 2000);

    ws2.on('close', function(){
        clearInterval(t);    
    });
});
ws2.on('message', function(data, flags) {
    // flags.binary will be set if a binary data is received
    // flags.masked will be set if the data was masked
    var data = (flags.bianry) ? msgpack.unpack(data) : data;
    console.log('received: %s', JSON.stringify(data));

    if (data.opc == SDP_ANSWER) {
        console.log("SDP answer: "+JSON.stringify(data.answer));
    }
});

// websocket server listen on 51686
var WebSocketServer = require('ws').Server
    , wss = new WebSocketServer({host: '0.0.0.0', port: 51686});
  
wss.on('connection', function(ws) {
    ws.on('message', function(message) {
        console.log('received: %s', message);
        ws.send('Pong Hello word @ '+Date.now());
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

