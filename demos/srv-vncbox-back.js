// iWebPP.IO name-server example
// Copyright (c) 2012-present Tom Zhou<iwebpp@gmail.com>
//
var fs = require('fs');
var nmSrv = require('../iwebpp.io-server');

var nmsrvs = new nmSrv(
    // endpoint info
    {
        ipaddr: '0.0.0.0', ports: [51686, 51868], // name server
          turn: [51688, 51866],                   // relay server
        option: {mbw: 128000}                      // user-specific feature, mbw: maxim bandwidth 32KB/s in default
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

// export name-server events by axon
/*var axon = require('axon')
  , push = axon.socket('push');

// use JSON codec
axon.codec.define('json', {
  encode: JSON.stringify,
  decode: JSON.parse
});

push.format('json');
push.bind('tcp://0.0.0.0:51888');
console.log('push server started');
*/

/*
nmsrvs.on('NS.SEP.SEP_OPC_SDP_OFFER', function(data){
    push.send({event: 'NS.SEP.SEP_OPC_SDP_OFFER', data: data.data});
});

nmsrvs.on('NS.SEP.SEP_OPC_NAT_OFFER', function(data){
    push.send({event: 'NS.SEP.SEP_OPC_NAT_OFFER', data: data.data});
});

nmsrvs.on('NS.SEP.SEP_OPC_STUN_OFFER', function(data){
    push.send({event: 'NS.SEP.SEP_OPC_STUN_OFFER', data: data.data});
});

nmsrvs.on('NS.SEP.SEP_OPC_TURN_OFFER', function(data){
    push.send({event: 'NS.SEP.SEP_OPC_TURN_OFFER', data: data.data});
});

nmsrvs.on('NS.SEP.SEP_OPC_PUNCH_ANSWER', function(data){
    push.send({event: 'NS.SEP.SEP_OPC_PUNCH_ANSWER', data: data.data});
});

nmsrvs.on('NS.client.close', function(data){
    push.send({event: 'NS.client.close', data: data});
});

nmsrvs.on('NS.client.error', function(data){
    push.send({event: 'NS.client.error', data: data});
});
*/

/*
nmsrvs.on('AS.SEP.SEP_OPC_PUNCH_OFFER', function(data){
    console.log('AS.SEP.SEP_OPC_PUNCH_OFFER:'+JSON.stringify(data.data));
    push.send({event: 'AS.SEP.SEP_OPC_PUNCH_OFFER', data: data.data});
});

nmsrvs.on('AS.client.close', function(data){
    console.log('AS.client.close:'+JSON.stringify(data));
    push.send({event: 'AS.client.close', data: data});
});
*/

// simple test
/*
var pull = axon.socket('pull');

pull.format('json');
pull.connect('tcp://localhost:51888');

pull.on('message', function(msg){
    console.log('pull.message:'+JSON.stringify(msg));
});
*/

// export name-server events by meteor/DDP RPC
var DDPClient = require("ddp");

var ddpclient = new DDPClient({
    host: "localhost", 
    port: 3000,
    auto_reconnect: true,
    auto_reconnect_timer: 180000
  });

  // monitoring name-server events
  // notes: only allow root user call these methods
  /*
  nmsrvs.on('AS.SEP.SEP_OPC_PUNCH_OFFER', function(data){
    console.log('AS.SEP.SEP_OPC_PUNCH_OFFER:'+JSON.stringify(data.data.offer));
    
    ddpclient.call('addVncEntry', ['root:eb7ae98c392dde85', data.data.offer], function(err, result) {
      console.log('addVncEntry, result: ' + result);
      if (!err && !result) {
          console.log('close name-client...');
          data.client.close();
      }
    });
  });
  */
  nmsrvs.on('NS.SEP.SEP_OPC_SRV_REPORT_OFFER', function(data){
    console.log('NS.SEP.SEP_OPC_SRV_REPORT_OFFER:'+JSON.stringify(data.data));
   
    // filter peer-vnc service 
    if (data.data.answer.state == nmSrv.SEP.SEP_OPC_STATE_READY &&
        data.data.answer.srv.cate == 'peer-vnc') {
	    ddpclient.call('addVncEntry', ['root:ea916b2fdfbe3bb4', data.data.answer.srv], function(err, result) {
	      console.log('addVncEntry, result: ' + result);
	      if (!err && !result) {
	          console.log('close name-client... TODO');
	          ///data.client.close();
	      }
	    });
    }
  });

  nmsrvs.on('AS.client.close', function(data){
    console.log('AS.client.close:'+JSON.stringify(data.clntinfo));

    data.clntinfo.peerid = data.clntinfo.gid;
    
    ddpclient.call('delVncEntry', ['root:ea916b2fdfbe3bb4', data.clntinfo], function(err, result) {
      console.log('delVncEntry, result: ' + result);
    });
  });

ddpclient.connect(function(error) {
  if (error) {
    console.log('DDP connection error!');
    return;
  }

  console.log('connected!');
/*
  ddpclient.call('test-function', ['foo', 'bar'], function(err, result) {
    console.log('called function, result: ' + result);
  })

  ddpclient.subscribe('posts', [], function() {
    console.log('posts complete:');
    console.log(ddpclient.collections.posts);
  })
  */

});

/*
 * Useful for debugging and learning the ddp protocol
 */
ddpclient.on('message', function(msg) {
    console.log("ddp message: " + msg);
}); 

/* 
 * If you need to do something specific on close or errors.
 * (You can also disable auto_reconnect and call ddpclient.connect()
 *  when you are ready to re-connect.)
*/
ddpclient.on('socket-close', function(code, message) {
  console.log("Close: %s %s", code, message);
});

ddpclient.on('socket-error', function(error) {
  console.log("Error: %j", error);
});

