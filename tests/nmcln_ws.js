
// msgpack
var msgpack = require('msgpack2');

// websocket client 1 connect to 51680
var WebSocket = require('ws');
var ws = new WebSocket('ws://localhost:51680/vurl', {hole: 51686});

ws.on('open', function() {
    ws.send('something from client');
    
    var t = setInterval(function(){
        ///ws.send('Ping Hello word @ '+Date.now());    
        ws.send(msgpack.pack({opc: 0, offer: {did: 0, appid: 'test'}}), {binary: true});
    }, 2000);

    ws.on('close', function(){
        clearInterval(t);    
    });
});
ws.on('message', function(data, flags) {
    // flags.binary will be set if a binary data is received
    // flags.masked will be set if the data was masked
    data = (flags.binary) ? msgpack.unpack(data) : data;
    console.log('received: %s', JSON.stringify(data));
});

// websocket client 2 connect to 51688
var ws2 = new WebSocket('ws://localhost:51688/vurl', {hole: 51686});

ws2.on('open', function() {
    ws2.send('something from client');
    
    var t = setInterval(function(){
        ///ws2.send('Ping Hello word @ '+Date.now());    
        ws.send(msgpack.pack({opc: 0, offer: {did: 0, appid: 'test1'}}), {binary: true});
    }, 2000);

    ws2.on('close', function(){
        clearInterval(t);    
    });
});
ws2.on('message', function(data, flags) {
    // flags.binary will be set if a binary data is received
    // flags.masked will be set if the data was masked
    data = (flags.binary) ? msgpack.unpack(data) : data;
    console.log('received: %s', JSON.stringify(data));
});

