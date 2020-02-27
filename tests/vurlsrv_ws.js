///require.paths.unshift('./node_modules/');

var connect = require('connect');

var app = connect()
    .use(connect.logger('dev'))
    .use(connect.static('public'))
    .use(function(req, res){
        res.end('hello world\n');
    });

console.log('Httpp connect server running on UDP port 51686 ...');
app.listen(51686);

// Punching hole on port 51686 ...

// websocket client 1 connect to 51680
var WebSocket = require('ws');
var ws = new WebSocket('ws://58.215.185.22:51680/vurl', {hole: 51686});

ws.on('open', function() {
    ws.send('something from client');
    
    var t = setInterval(function(){
        ///ws.send('Ping Hello word @ '+Date.now());    
    }, 2000);

    ws.on('close', function(){
        clearInterval(t);    
    });
});
ws.on('message', function(data, flags) {
    // flags.binary will be set if a binary data is received
    // flags.masked will be set if the data was masked
    console.log('received: %s', data);
});

// websocket client 2 connect to 51688
var ws2 = new WebSocket('ws://58.215.185.22:51688/vurl', {hole: 51686});

ws2.on('open', function() {
    ws2.send('something from client');
    
    var t = setInterval(function(){
        ///ws2.send('Ping Hello word @ '+Date.now());    
    }, 2000);

    ws2.on('close', function(){
        clearInterval(t);    
    });
});
ws2.on('message', function(data, flags) {
    // flags.binary will be set if a binary data is received
    // flags.masked will be set if the data was masked
    console.log('received: %s', data);
});

