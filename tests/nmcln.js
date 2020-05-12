'use strict';

var sys = require('sys');

// websocket client
var wsc = require('websocket-client/lib/websocket').WebSocket;

var client = new wsc('ws://localhost:8000/biff', 'borf');

client.addListener('data', function(buf) {
    sys.debug('Got data: ' + sys.inspect(buf));
});
client.onmessage = function(m) {
    sys.debug('Got message: ' + JSON.stringify(m));
};

var t = setInterval(function(){
    client.send('Hello word @ '+Date.now());    
}, 2000);

client.on('close', function(){
    clearInterval(t);    
});