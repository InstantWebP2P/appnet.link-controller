// Copyright (c) 2012-present Tom Zhou<appnet.link@gmail.com>

var SEP = require('appnet.io').SEP;

process.on('uncaughtException', function (err) {
  console.log('Caught exception: ' + err);
});

// p2p stream websocket library
var WebSocket = require('wspp');

// connecting to primary name-server
var con = new WebSocket('wss://127.0.0.1:'+process.argv[2]+SEP.SEP_CTRLPATH_HS, {httpp: true});

var t = setTimeout(function(){
    console.log('connecting to hole punch server timeout');
}, 2000); // 2s in default

con.on('open', function(){
    clearTimeout(t);
    console.log('connecting to hole punch server successfully');
    con.close();
});
