// iWebPP.IO name-server V2 implementation based SecureWebsocket and NaclCert, that works with iwebpp.io name-client
// Copyright (c) 2014-present Tom Zhou<iwebpp@gmail.com>
//

'use strict';
var debug  = require('debug')('iwebpp.io.srv.v2');


// iWebPP.io module
var iWebPP = require('iwebpp.io').V2;

// Session establish protocol
var SEP = iWebPP.SEP;

// eventEmitter
var eventEmitter = require('events').EventEmitter,
    util = require('util'),
    url = require('url'),
    http = require('http'),
    https = require('https');
    httpp   = require('httpp'),
    httpps  = require('httpps'),
    crypto  = require('crypto'),
    Connect = require('connect'),
    connect_httpp = require('connect-httpp'),
    UDT = require('udt');

// security hash
// SIPKEY can be any user defined 4 integers
var SIPHASH = require('siphash'),
    SIPKEY = [0x33336666, 0x33338888, 0x88889999, 0x11116666]; // magic key

// MSGPACK library
var MSGPACK = require('msgpack-js');

// p2p stream websocket library
///var WebSocket = require('wspp');
///var WebSocketServer = WebSocket.Server;

// secure websocket library
var SecureWebSocket = require('node-sws');
var SecureWebSocketServer = SecureWebSocket.Server;
var Naclcert = SecureWebSocket.Naclcert;

// httpp-proxy library
var httppProxy = require('httpp-proxy');

// UUID generator
var UUID = require('uuid');

// SDP model
var Sdp = require('./sdp');

// STUN model
var Stun = require('./stun');

// TURN model
var Turn = require('./turn');

// vURL model
var vurl = require('./vurl');
var vURL = new vurl(); // memory store by now TBD... memory DB

// Peer service model
var peerservice = require('./peerservice');
var peerService = new peerservice(); // memory store by now TBD... memory DB

// SSL binary wrap
var SSL = require('./ssl');

// GeoIP model
var geoIP = require('geoip-lite');

// Debug level
// 1: display error, proxy entry
// 2: display req/res headers/statusCode
var Debug = 0;


// name-server pair: primary/alternate listen on UDP port 51686/51868 in default
// turn-server pair: proxy/agent server
// - endpoints       : {dn: domain name, ipaddr: name-server hostname or IP, ports: [primary,alternative], turn: [proxy,agent], option: {mbw:xxx, ...}}
// - endpoints.dn    : server's domain name, it's needed for TURN session
// - endpoints.turn  : turn proxy/agent ports
// - endpoints.option: default user-specific features,like mbw - maxim bandwidth, etc
// - 
// -         seccerts: {
//                         // SSL certs
//                         sslcerts: {
//                                    ca: {key: xxx, cert: xxx, cont: xxx}, 
//                                    ns: {key: xxx, cert: yyy}, 
//                                    as: {key: xxx, cert: yyy}, 
//                                    ps: {key: xxx, cert: yyy, subdn:{'subdomain': {key:x, cert: x}}}} https/httpps SSL certs
//                         },
//                         // NACL certs
//                         naclcerts: {
//                                    ca: {key: xxx, cert: xxx}, 
//                                    ns: {key: xxx, cert: yyy}, 
//                                    as: {key: xxx, cert: yyy}, 
//                                    ps: {key: xxx, cert: yyy} secure websocket NACL certs
//                         }
//           }
var nmSrv = exports = module.exports = function(endpoints, seccerts){
    if (!(this instanceof nmSrv)) return new nmSrv(endpoints, seccerts);

    var self = this;
       
    
    // super constructor
    eventEmitter.call(self);

    // at least two ports to listen
    self.dn     = endpoints.dn      || 'iwebpp.com';
    self.ipaddr = endpoints.ipaddr  || '0.0.0.0';
    self.ports  = endpoints.ports   || [51686, 51868];
    	
    // check on secure certs /////////////////////////////
    seccerts      = seccerts || {};
    var sslcerts  = (seccerts && seccerts.sslcerts)  || {};
    var naclcerts = (seccerts && seccerts.naclcerts) || {};

	// SSL certs
	self.sslcerts    = sslcerts || {};
	self.sslcerts.ns = self.sslcerts.ns || false;
	self.sslcerts.as = self.sslcerts.as || false;
	self.sslcerts.ps = self.sslcerts.ps || false;
	
	// ssl CA cert/key
	self.sslcerts.ca = self.sslcerts.ca || false;
		
	// NACL certs
	self.naclcerts    = naclcerts || {};
	self.naclcerts.ns = self.naclcerts.ns || false;
	self.naclcerts.as = self.naclcerts.as || false;
	self.naclcerts.ps = self.naclcerts.ps || false;
	
	// NACL CA cert/key
	self.naclcerts.ca = self.naclcerts.ca || {};
	self.naclcerts.ca.cert = self.naclcerts.ca.cert || Naclcert.rootCACert;
	//////////////////////////////////////////////////////
	
	// default user-specific features
	self.option = endpoints.option || {};
	
	// server obj cache
    self.srvs = {};
    
    // clients connection cache
    self.conn = {}; // ['clnt2srv'] = client connection

    // turn server obj cache
    self.turnPorts        = endpoints.turn;
    self.turnSrvs         = {}; // proxy/agent server
    self.turnConn         = {}; // ['clnt2agentsrv'/''clnt2proxysrv''] = client connection
    self.turnProxyCache   = {}; // proxy cache to record vurl to httpp-proxy map. TBD... with DB
    self.trunProxyHistory = {}; // proxy history to record user connection info to vurl map. TBD... with DB
                                // - key: user connection host:vurl or host:port:vurl in case security mode 2
                                // - val: {
                                // timestamp:   // timestamp of connection
                                //     state: , // 0: fail, 1: pass, -1: reject with timeout,
                                //      trys: , // re-try times before pass 
                                //   maxTrys: , // maxim re-trys. default 6 times
                                //   timeOut:   // reject timeout. default 6s 
                                // }

    // wrap socket.send method
    function sendOpcMsg(socket, opc_msg, fn){ 
        try {
            if (socket && socket.send) {
            	// V2 will use msgpack
                socket.send(MSGPACK.encode(opc_msg), {binary: true, mask: false}, function(err){
                    if (err) {
                        console.log(err+',sendOpcMsg failed');
                        if (fn) fn(err+',sendOpcMsg failed');
                    } else {
                        if (fn) fn(null);
                    }
                });
            } else {
                console.log('invalid socket,sendOpcMsg failed immediately');
                if (fn) fn('invalid socket,sendOpcMsg failed immediately');
            }
        } catch (e) {
            console.log(e+',sendOpcMsg failed immediately');
            if (fn) fn(e+',sendOpcMsg failed immediately');
        }
    }

    // on connection process
    function onConnection(client) {
        var sk, ck;   // key for server/client on public ip/port
        var peerclnt; // the connection obj which the peer come from 
        var mineclnt; // the connection obj which the client come from
        
        if (Debug) console.log('new connection');
        
        // initialize offer message count per client
        // every time, server send one offer message, increase it by one
        client.offerMsgcnt = 0;
        
        // onMessage handler
        client.on('message', function(message, flags){
         // !!! catch any exceptions and ignore it
         try {
        
            var data = (flags.binary) ? MSGPACK.decode(message) : JSON.parse(message);
            
            if (Debug) console.log('nmsrv:new message:'+JSON.stringify(data));
            
            // check if opc is valid
            if ('number' === typeof data.opc) {
                switch (data.opc) {
                // offer/answer opc -> /////////////////////////////////////////////
                case SEP.SEP_OPC_SDP_OFFER:
                    // 1.
                    // check offer credit by user info
                    
                    // 1.1
                    // notes: only support 51dese.com as domain at present !!!
                    if (data.offer.domain != '51dese.com' && data.offer.domain != 'www.51dese.com') {
                        console.log('invalid domain, please use 51dese.com by now');
                        
                        data.opc    = SEP.SEP_OPC_SDP_ANSWER;
                        
                        data.answer = {};
                        data.answer.ready = false;
                        data.answer.error = 'invalid domain, please use 51dese.com by now';
                        
                        // 1.1.1
                        // send back answer message, then close client and agent client in case have
                        sendOpcMsg(client, data, function(err){
                            if (err) console.log(err+'sendOpcMsg failed');
                            
                            setTimeout(function(){
                                if (client && client.close) client.close();
                            }, 2000); // 2s timeout
                        });
                        
                        // 1.1.1.1
                        // emit event
                        self.emit('NS.SEP.SEP_OPC_SDP_OFFER', {client: client, data: data});
                        
                        break;
                    }
                    
                    // 1.2
                    // check if usrkey is existing
                    // TBD...
                    //Sdp.testUser({domain: data.offer.domain, usrkey: data.offer.usrkey}, function(err, yes){
                    
                    //}); 
                                       
                    // 2.
                    // record SDP session
                    var sesn = {};
                    //sesn = data.offer;
                    for (var k in data.offer) {
                        sesn[k] = data.offer[k];    
                    }
                    
                    // 2.1
                    // fill session info saw by server
                    sesn.clntpublicIP   = client.remoteAddress;
                    sesn.clntpublicPort = client.remotePort;
                    sesn.srvlocalIP     = client.address().address;
                    sesn.srvlocalPort   = client.address().port;
                    sesn.srvpublicDN    = self.dn;    
                    sesn.sid            = UUID.v4();
                    
                    // 2.2
                    // query client's geoIP
                    sesn.clntgeoip = JSON.stringify(geoIP.lookup(client.remoteAddress));
                    if (Debug) console.log('new name-client GeoIP:'+sesn.clntgeoip); 
                    
                    // 2.3
                    // persistent session info
                    var sdp = new Sdp(sesn);
                    if (Debug) console.log('new SDP session:'+JSON.stringify(sdp));

                    sdp.saveOupdate(function(err, sdp){
                        // 3.
                        // send back SDP answer
                        data.opc    = SEP.SEP_OPC_SDP_ANSWER;
                        data.answer = {};
                    
                        if (err || !sdp) {
                            console.log('new SDP session failed:'+err);
                            // send back fake SDP session as answer
                            data.answer       = {};
                            data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                            
                            // close socket after 2s
                            sendOpcMsg(client, data, function(err){
                                if (err) console.log(err+'sendOpcMsg failed');
                                
                                setTimeout(function(){
                                    if (client && client.close) client.close();                                    
                                }, 2000); // 2s timeout
                            });
                            
		                    // 3.1
		                    // emit event
		                    self.emit('NS.SEP.SEP_OPC_SDP_OFFER', {client: client, data: data});
                        } else {
                            // hook client info
                            client.clntinfo = {
                                // user info
                                domain: data.offer.domain,
                                usrkey: data.offer.usrkey,
                                    
                                // client info
                                     gid: sdp.client.gid,     // client gid
                                   vpath: sdp.client.vpath,   // client vpath
                                   vhost: sdp.client.vhost,   // client vhost
                                   vmode: sdp.client.vmode,   // client vURL mode
                                 secmode: sdp.client.secmode, // client secure mode
                                  vtoken: sdp.client.vtoken,  // client vURL secure token
                                  
                               clntgeoip: JSON.parse(sdp.client.geoip), // client GeoIP
                                 clntlip: sdp.client.localIP, // client local ip/port
                               clntlport: sdp.client.localPort,
                               
                                  clntip: sdp.sdp.clntIP,  // client public ip/port
                                clntport: sdp.sdp.clntPort,
                                
                                   srvip: sdp.server.ip,   // server public ip/port
                                 srvport: sdp.server.port,
                                   srvdn: sdp.server.dn
                            };
                            // cache client obj per server/client with public ip/port
                            // TBD... cache in redisStore, etc, instead of memStore
                            ck = sdp.sdp.clntIP+':'+sdp.sdp.clntPort; // key for client ip/port
                            sk = sdp.server.ip+':'+sdp.server.port;   // key for server ip/port
                            self.conn[sk]       = self.conn[sk] || {};
                            (self.conn[sk])[ck] = client;
                            
                            // send back real SDP session as answer
                            data.answer       = sdp;
                            data.answer.state = SEP.SEP_OPC_STATE_READY;
                            
                            // !!! for security, only return country/city of GeoIP to client
                            if (data.answer.client.geoip) {
	                            data.answer.client.geoip = JSON.parse(data.answer.client.geoip);
	                            Object.keys(data.answer.client.geoip).forEach(function(k){
	                                if (!(k in {country: 'us', city: 'ca'})) {
	                                    data.answer.client.geoip[k] = null; 
	                                    delete data.answer.client.geoip[k];    
	                                }
	                            });
                            }
                            
                            // send TURN server agent port info,ip is same as name-server normally
                            // TBD balance...
                            if (self.turnPorts) {
                                data.answer.turn = {agentport: self.turnPorts[1], agentip: sdp.server.ip};
                            } else {
                                data.answer.turn = false;
                            }
                            
	                        // 3.2
                            // generate security certification in secure mode
                            // TBD... added subject's alternate name like public/local ip, etc
                            if (data.offer.secmode) {
                                // require server to generate ssl certification
                                SSL.genSslCertCA(sdp.client.gid,
                                // client cert info
                                {
                                         cn: '*.vurl.'+sdp.server.dn,
                                    ca_cert: self.sslcerts.ca && self.sslcerts.ca.cert,
                                     ca_key: self.sslcerts.ca && self.sslcerts.ca.key,
                                     
                                    // SSL V3 alternate names: sub-domains, public/local ip, 127.0.0.1
                                    altname: [
                                        ///'*.*.vurl.'+sdp.server.dn, '*.vurl.local.'+sdp.server.dn, '*.*.vurl.local.'+sdp.server.dn,
                                        ///'*.vurl.'+sdp.server.dn,
                                        client.clntinfo.clntip, client.clntinfo.clntlip, '127.0.0.1'
                                    ]
                                },
                                function(err, cert){
                                    if (err) {
                                        console.log(err+',generate security certs failed');
                                        data.answer.secerts = null;
                                         
	                                    sendOpcMsg(client, data);
	                                     
					                    // 3.2.1
					                    // emit event
					                    self.emit('NS.SEP.SEP_OPC_SDP_OFFER', {client: client, data: data});
                                    } else {
                                        // 3.2.2
                                        // like for *.vurl.iwebpp.com
                                        data.answer.secerts = cert;
                                        
                                        // 3.2.3
                                        // put self-signed CA cert
                                        data.answer.secerts.ca = self.sslcerts.ca && self.sslcerts.ca.cont;
                                        
                                        // enable bi-direction authentication
                                        data.answer.secerts.requestCert = true;
                                        data.answer.secerts.rejectUnauthorized = true;  
                                                                        
                                        // fill NACL cert info on V2 /////////////////////////////////////////////////
                                        if (data.offer.version && data.offer.version == 2) {
                                        	var reqdesc = {
                                        			  version: '1.0',
                                        			     type: 'ca',
                                        			      tte: new Date().getTime() + 365*24*3600000, // one year to expire
                                        			publickey: data.offer.naclpublickey,
                                        			    names: [sdp.server.dn, 'localhost'],
                                        			      ips: [client.clntinfo.clntip, client.clntinfo.clntlip, '127.0.0.1']
                                        	};
                                        	var bcert = Naclcert.generate(reqdesc, self.naclcerts.ca.key.secretkey, self.naclcerts.ca.cert);
                                        	
                                        	data.answer.secerts.naclcert = bcert;
                                        }
                                        ////////////////////////////////////////////////////////////////////////
                                        
                                        // 3.2.5
                                        // send sdp back
                                        sendOpcMsg(client, data);

                                        // 3.2.6
                                        // emit event
                                        self.emit('NS.SEP.SEP_OPC_SDP_OFFER', {client: client, data: data});
                                    }
                                });
                            } else {
                            	// fill NACL cert info on V2 /////////////////////////////////////////////////
                            	if (data.offer.version && data.offer.version == 2) {
                            		var reqdesc = {
                            				  version: '1.0',
                            				     type: 'ca',
                            				      tte: new Date().getTime() + 365*24*3600000, // one year to expire
                            				publickey: data.offer.naclpublickey,
                            				    names: [sdp.server.dn, 'localhost'],
                            				      ips: [client.clntinfo.clntip, client.clntinfo.clntlip, '127.0.0.1']
                            		};
                            		var bcert = Naclcert.generate(reqdesc, self.naclcerts.ca.key.secretkey, self.naclcerts.ca.cert);

                            		data.answer.secerts = {};
                            		data.answer.secerts.naclcert = bcert;
                            	}
                            	////////////////////////////////////////////////////////////////////////

                            	sendOpcMsg(client, data);

                            	// 3.2.6
                            	// emit event
                            	self.emit('NS.SEP.SEP_OPC_SDP_OFFER', {client: client, data: data});
                            }
                        }
                    });
                    break;
                    
                case SEP.SEP_OPC_NAT_OFFER:
                    // 1.
                    // check if user was allowed to query it
                    // TBD...
                    
                    // 2.
                    // update client NAT type info
                    Sdp.updateClntInfo({gid: data.offer.gid, natype: data.offer.natype}, function(err){
                        // 3.
                        // fill answer opc
                        data.opc = SEP.SEP_OPC_NAT_ANSWER;
                        data.answer = {};
                        data.answer.state = SEP.SEP_OPC_STATE_READY;
                    
                        if (err) {
                            console.log(err+',update client natype failed');
                            data.answer.ready = false;
                        } else {
                            console.log('update client natype successfully');
                            data.answer.ready = true;
                        }
                        
                        // 4.
                        // send message back
                        sendOpcMsg(client, data);
                        
	                    // 4.1
	                    // emit event
	                    self.emit('NS.SEP.SEP_OPC_NAT_OFFER', {client: client, data: data});
                    });
                    break;


                    case SEP.SEP_OPC_HEART_BEAT_OFFER:
                        // 1.
                        // check if user was allowed to query it
                        // TBD...
                    
                        // 2.
                        // heart-beat check response
                
                        // 2.1
                        // fill answer opc
			data.opc = SEP.SEP_OPC_HEART_BEAT_ANSWER;
			data.answer = {};
			data.answer.state = SEP.SEP_OPC_STATE_READY;
			
			data.answer.ready = true;
				
			// fill server timestamp
			data.answer.timeAt = Date.now();
				
			// 3.
			// send message back
			sendOpcMsg(client, data);
				
			// 3.1
			// emit event
		        self.emit('NS.SEP.SEP_OPC_HEART_BEAT_OFFER', {client: client, data: data});
                    break;

                case SEP.SEP_OPC_STUN_OFFER:
                    if (Debug) console.log('stun.offer:'+JSON.stringify(data));
                    // 1.
                    // check offer credit
                    // TBD... policy
                    // - allow to public peer
                    // - allow to test user
                    // - allow to user-self peer
                    // - allow to peer authenticated ACL list
                   
                    /*
                    console.log('self.conn.skeys:'); 
                    for (k in self.conn) { 
                        console.log(', '+k+',ckeys:');
                        for (var k1 in self.conn[k]) {
                            console.log(', '+k1);
                        }
                    }
                    console.log('offer.mine:'+data.offer.mine.ip+':'+data.offer.mine.port+'@'+
                                client.clntinfo.srvip+':'+client.clntinfo.srvport);
                                
                    console.log('offer.peer:'+data.offer.peer.ip+':'+data.offer.peer.port+'@'+
                                client.clntinfo.srvip+':'+client.clntinfo.srvport);
                    */                                
                    // TBD... clients cache load balance
                    /*var ck = data.offer.mine.ip+data.offer.mine.port;
                    for (var sk in self.conn) {
                        if (ck in self.conn[sk]) {
                            peerclnt = (self.conn[sk])[ck];
                            break;
                        }
                    }*/
                          
                    /*mineclnt = (self.conn[client.clntinfo.srvip+':'+client.clntinfo.srvport])
                                         [data.offer.mine.ip+':'+data.offer.mine.port];*/
			                                                                        
                    mineclnt = client; // current client is always mine
                                         
                    peerclnt = (self.conn[client.clntinfo.srvip+':'+client.clntinfo.srvport])
                                         [data.offer.peer.ip+':'+data.offer.peer.port];
                                         
                    // 1.1
                    // check on user for authentication
                    // only allow user connect to user-self, public user and test user
                    // TBD... Policy-Based_ACL
                    if (mineclnt.clntinfo &&  mineclnt.clntinfo.domain && mineclnt.clntinfo.usrkey &&
                        peerclnt.clntinfo &&  peerclnt.clntinfo.domain && peerclnt.clntinfo.usrkey &&
                         // 1.1.1
                         // !!! allow connect to user-self
                        ((mineclnt.clntinfo.domain === peerclnt.clntinfo.domain && mineclnt.clntinfo.usrkey === peerclnt.clntinfo.usrkey) || 
                         // 1.1.2
                         // !!! allow connect to public user 
                         (mineclnt.clntinfo.domain === peerclnt.clntinfo.domain && 'public' === peerclnt.clntinfo.usrkey) ||
                         // 1.1.3
                         // !!! allow connect to test user 
                         (mineclnt.clntinfo.domain === peerclnt.clntinfo.domain && 
                          mineclnt.clntinfo.usrkey.match(/(A|B|C)/gi) && 
                          peerclnt.clntinfo.usrkey.match(/(A|B|C)/gi)))) {
                        
                        ///
                    } else {
                        console.log('!!!DDOS attack,no permission to get STUN session');
                        
                        // 1.1.3
                        // send STUN_ANSWER to myself client
	                    data.offer.isInitiator = true;
	                    
	                    data.opc = SEP.SEP_OPC_STUN_ANSWER;
	                    
                        data.answer = {};
                        data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                        data.answer.ready = false;
                        
                        // 1.1.5
                        // close after 2s
                        sendOpcMsg(mineclnt, data, function(err){
                            if (err) console.log(err+'sendOpcMsg failed');
                            
                            setTimeout(function(){
                                if (mineclnt && mineclnt.close) mineclnt.close();                                    
                            }, 2000); // 2s timeout
                        });
                        
	                    if (Debug) console.log('mineclnt stun.data.offer:'+JSON.stringify(data.offer));
	                    
	                    // 1.1.6
	                    // emit event with initiator
	                    self.emit('NS.SEP.SEP_OPC_STUN_OFFER', {client: mineclnt, data: data});
	                    
	                    break;
                    }
                                        
                    // 2.
                    // fill punch hole offer
                    data.opc = SEP.SEP_OPC_PUNCH_OFFER;
                    
                    // 3.
                    // send punch hole offer to both peers
                                                                          
                    // 3.1
                    // keep data.seqno as stun initiator
                    
                    // send punch hole offer to myself client
                    data.offer.isInitiator = true;
                    sendOpcMsg(mineclnt, data);
                    if (Debug) console.log('mineclnt stun.data.offer:'+JSON.stringify(data.offer));
                    
                    // emit event with initiator
                    self.emit('NS.SEP.SEP_OPC_STUN_OFFER', {client: mineclnt, data: data});
                    
                    // swap offer.mine and offer.peer to assemble PUNCH offer for peer client
                    var tmp = data.offer.mine;
                    data.offer.mine = data.offer.peer;
                    data.offer.peer = tmp;
              
                    // send punch hole offer to peer client
                    data.offer.isInitiator = false;
                    sendOpcMsg(peerclnt, data);
                    if (Debug) console.log('peerclnt stun.data.offer:'+JSON.stringify(data.offer));
                    
                    break;
                    
                case SEP.SEP_OPC_TURN_OFFER:
                    if (Debug) console.log('turn.offer:'+JSON.stringify(data));
                    // 1.
                    // check offer credit
                    // TBD... policy
                    // - allow to public peer
                    // - allow to test user
                    // - allow to user-self peer
                    // - allow to peer authenticated ACL list

                    /*
                    console.log('self.conn.skeys:'); 
                    for (k in self.conn) { 
                        console.log(', '+k+',ckeys:');
                        for (var k1 in self.conn[k]) {
                            console.log(', '+k1);
                        }
                    }
                    console.log('offer.mine:'+data.offer.mine.ip+':'+data.offer.mine.port+'@'+
                                client.clntinfo.srvip+':'+client.clntinfo.srvport);
                                
                    console.log('offer.peer:'+data.offer.peer.ip+':'+data.offer.peer.port+'@'+
                                client.clntinfo.srvip+':'+client.clntinfo.srvport);
                    */                                
                    // TBD... clients cache load balance
                    /*var ck = data.offer.mine.ip+data.offer.mine.port;
                    for (var sk in self.conn) {
                        if (ck in self.conn[sk]) {
                            peerclnt = (self.conn[sk])[ck];
                            break;
                        }
                    }*/
                          
                    /*mineclnt = (self.conn[client.clntinfo.srvip+':'+client.clntinfo.srvport])
                                         [data.offer.mine.ip+':'+data.offer.mine.port];*/
			                                                                        
                    mineclnt = client; // current client is always mine
                                         
                    peerclnt = (self.conn[client.clntinfo.srvip+':'+client.clntinfo.srvport])
                                         [data.offer.peer.ip+':'+data.offer.peer.port];
                                         
                    // 1.1
                    // check on user for authentication
                    // only allow user connect to user-self, public user and test user
                    // TBD... Policy-Based_ACL
                    if (mineclnt.clntinfo &&  mineclnt.clntinfo.domain && mineclnt.clntinfo.usrkey &&
                        peerclnt.clntinfo &&  peerclnt.clntinfo.domain && peerclnt.clntinfo.usrkey &&
                         // 1.1.1
                         // !!! allow connect to user-self
                        ((mineclnt.clntinfo.domain === peerclnt.clntinfo.domain && mineclnt.clntinfo.usrkey === peerclnt.clntinfo.usrkey) || 
                         // 1.1.2
                         // !!! allow connect to public user 
                         (mineclnt.clntinfo.domain === peerclnt.clntinfo.domain && 'public' === peerclnt.clntinfo.usrkey) ||
                         // 1.1.3
                         // !!! allow connect to test user 
                         (mineclnt.clntinfo.domain === peerclnt.clntinfo.domain && 
                          mineclnt.clntinfo.usrkey.match(/(A|B|C)/gi) && 
                          peerclnt.clntinfo.usrkey.match(/(A|B|C)/gi)))) {
                        
                        ///
                    } else {
                        console.log('!!!DDOS attack,no permission to get TURN session');
                        
                        // 1.1.3
                        // send TURN_ANSWER to myself client
	                    data.offer.isInitiator = true;
	                    
	                    data.opc = SEP.SEP_OPC_TURN_ANSWER;
	                    
                        data.answer = {};
                        data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                        data.answer.ready = false;
                        
                        // 1.1.5
                        // close after 2s
                        sendOpcMsg(mineclnt, data, function(err){
                            if (err) console.log(err+'sendOpcMsg failed');
                            
                            setTimeout(function(){
                                if (mineclnt && mineclnt.close) mineclnt.close();                                    
                            }, 2000); // 2s timeout
                        });
                        
	                    if (Debug) console.log('mineclnt turn.data.offer:'+JSON.stringify(data.offer));
	                    
	                    // 1.1.6
	                    // emit event with initiator
	                    self.emit('NS.SEP.SEP_OPC_TURN_OFFER', {client: mineclnt, data: data});
	                    
	                    break;
                    }
			                                                           
                    // 2.
                    // check if Peer is ready for TURN/AGENT relay
                    // - find TURN/PROXY routing entry by peer's vURL root path
                    // - if TURN/AGENT ready, but no routing entry, just create one
                    // notes: by now we treat name-client's vURL root path as /vurl/:gid/
                    // TBD... vURL balance by name-client' GID
                    data.opc = SEP.SEP_OPC_TURN_ANSWER;
                    data.answer = {};
                                        
                    // every name-client has vURL based on vhost or vpath
                    var vurle = (data.offer.peer.vmode === vurl.URL_MODE_PATH) ? data.offer.peer.vpath : data.offer.peer.vhost;
                    
                    vURL.get(vurle, function(err, routing){
                        if (err || !routing || !routing.turn) {
                            console.log('unknown TURN/PROXY routing entry');
                            
                            data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                            data.answer.ready = false;
                            
                            // 2.1
			                // send turn answer to myself client
			                /*mineclnt = (self.conn[client.clntinfo.srvip+':'+client.clntinfo.srvport])
			                                         [data.offer.mine.ip+':'+data.offer.mine.port];*/
			                mineclnt = client; // current client is always mine
			                    
			                data.answer.isInitiator = true;
			                sendOpcMsg(mineclnt, data);
			                
			                // 2.1.1
			                // emit event with initiator
                            self.emit('NS.SEP.SEP_OPC_TURN_OFFER', {client: mineclnt, data: data});
                        } else {                            
                            // 3.
                            // persistent TURN session
	                        var turn = new Turn({
	                            // session info
	                            sid       : UUID.v4(),
	                            proto     : 'udp',
	                            mode      : data.offer.mode,
	                            
	                            // client info
	                            minenatype: data.offer.mine.natype,
	                            mineid    : data.offer.mine.gid,
	                            mineIP    : data.offer.mine.ip,
	                            minePort  : data.offer.mine.port,
	                            
	                            peernatype: data.offer.peer.natype,
	                            peerid    : data.offer.peer.gid,
	                            peerIP    : data.offer.peer.ip,
	                            peerPort  : data.offer.peer.port,
	                            
	                            // turn server info got by vURL lookup
	                            srvpublicDN : routing.turn.dn,
	                            srvpublicIP : routing.turn.ipaddr,
	                            srvproxyPort: routing.turn.proxyport,
	                            srvagentPort: routing.turn.agentport
	                        });
	                        
	                        turn.saveOupdate(function(err, turn){
	                            if (err) {
	                                console.log(err+',record turn session failed');
	                                data.answer.state = SEP.SEP_OPC_STATE_FAIL;
	                                data.answer.ready = false;
	                            } else {
	                                // fill answer info
	                                if (Debug) console.log('saved turn session successfully:'+JSON.stringify(turn));
	                                data.answer.state = SEP.SEP_OPC_STATE_READY;
	                                data.answer.ready = true;
	                                data.answer.peer  = turn.peer;
	                                data.answer.mine  = turn.mine;
	                                data.answer.turn  = turn.session;
	                                
	                                // fill TURN/PROXY vURL vpath or vhost info
                                    data.answer.turn.vpath  = data.offer.peer.vpath;
                                    data.answer.turn.vhost  = data.offer.peer.vhost;
                                    data.answer.turn.vmode  = data.offer.peer.vmode;
                                    data.answer.turn.vtoken = data.offer.peer.vtoken;
                                    
                                    // fill TURN security mode as peer security mode
                                    data.answer.turn.secmode = data.offer.peer.secmode;
	                            }
	                            
			                    // 4.
			                    // send turn answer to both peers
			                    // - initiator will setup connection to turn/proxy server, then by turn/agent-client to peer
			                    // - responsor will allow connection from turn/agent-client by turn/proxy server from initiator
			                                        			                                                       
			                    // keep data.seqno as turn initiator
			                    
			                    // 4.1
			                    // send turn answer to myself client
			                    data.answer.isInitiator = true;
			                    sendOpcMsg(mineclnt, data);
			                    if (Debug) console.log('mineclnt turn.data.offer:'+JSON.stringify(data.offer));
			                    
			                    // 4.1.1
			                    // emit event with initiator
                                self.emit('NS.SEP.SEP_OPC_TURN_OFFER', {client: mineclnt, data: data});
                            
			                    // 4.2
			                    // swap offer.mine and offer.peer to assemble TURN answer for peer client
			                    // notes: only send it when find TURN/PROXY routing entry
			                    if (data.answer.state === SEP.SEP_OPC_STATE_READY) {
				                    var tmp = data.offer.mine;
				                    data.offer.mine = data.offer.peer;
				                    data.offer.peer = tmp;
				              
				                    // send turn answer to peer client
				                    data.answer.isInitiator = false;
				                    sendOpcMsg(peerclnt, data);
				                    if (Debug) console.log('peerclnt turn.data.offer:'+JSON.stringify(data.offer));
			                    }
	                        });
                        }
                    });
                 
                    break;
            
                case SEP.SEP_OPC_PUNCH_ANSWER:
                    // 1.
                    // check answer credit
                    
                    // 2.
                    // send STUN answer to initiator
                    // Algorithem:
                    // - for both of asymmmetric NAT/FW, send message from Initiator side to name-server
                    // - for one asymmetric NAT/FW, another's symmetric, send message from symmetric side
                    // - for both of symmmetric NAT/FW, send message from Initiator side to name-server
                                       
                    // 2.1
                    // fill STUN answer
                    data.opc = SEP.SEP_OPC_STUN_ANSWER;
                    if (data.answer.state === SEP.SEP_OPC_STATE_READY) {
                        data.answer.ready = true;
                        
                        // persist STUN session
                        var stun = new Stun({
                            sid       : UUID.v4(),
                            proto     : 'udp',
                            mode      : data.offer.mode,
                            
                            minenatype:  data.offer.isInitiator ? data.offer.mine.natype : data.offer.peer.natype,
                            mineid    :  data.offer.isInitiator ? data.offer.mine.gid    : data.offer.peer.gid,
                            
                            peernatype: !data.offer.isInitiator ? data.offer.mine.natype : data.offer.peer.natype,
                            peerid    : !data.offer.isInitiator ? data.offer.mine.gid    : data.offer.peer.gid,
                            
                            // MUST extract external ip/port from answer instead of offer.mine/peer
                            mineIP    :  data.offer.isInitiator ? ((data.answer.cinfo && data.answer.cinfo.moaddr) || data.offer.mine.ip) :
                                                                  ((data.answer.cinfo && data.answer.cinfo.poaddr) || data.offer.peer.ip),
                            minePort  :  data.offer.isInitiator ? ((data.answer.cinfo && data.answer.cinfo.moport) || data.offer.mine.port) :
                                                                  ((data.answer.cinfo && data.answer.cinfo.poport) || data.offer.peer.port),
                            
                            peerIP    : !data.offer.isInitiator ? ((data.answer.cinfo && data.answer.cinfo.moaddr) || data.offer.mine.ip) :
                                                                  ((data.answer.cinfo && data.answer.cinfo.poaddr) || data.offer.peer.ip),
                            peerPort  : !data.offer.isInitiator ? ((data.answer.cinfo && data.answer.cinfo.moport) || data.offer.mine.port) :
                                                                  ((data.answer.cinfo && data.answer.cinfo.poport) || data.offer.peer.port)
                        });
                        
                        stun.saveOupdate(function(err, stun){
                            if (err) {
                                console.log(err+',record stun session failed');
                                data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                                data.answer.ready = false;
                            } else {
                                // fill answer info
                                if (Debug) console.log('saved stun session successfully:'+JSON.stringify(stun));
                                data.answer.state = SEP.SEP_OPC_STATE_READY;
                                data.answer.ready = true;
                                data.answer.peer  = stun.peer;
                                data.answer.mine  = stun.mine;
                                data.answer.stun  = stun.session;
                            }
                            
                            // 2.2
                            // find connection of initiator
                            // TBD... mine/peer client load balance
                             /*var ck = data.offer.mine.ip+data.offer.mine.port;
                            for (var sk in self.conn) {
                                if (ck in self.conn[sk]) {
                                    mineclnt = (self.conn[sk])[ck];
                                    break;
                                }
                            }*/
                            if (data.offer.isInitiator) {
                                // current client is initiator
                                mineclnt = client; 
                            } else {
                                // peer client is initiator
                                mineclnt = (self.conn[client.clntinfo.srvip+':'+client.clntinfo.srvport])
                                                     [data.offer.peer.ip+':'+data.offer.peer.port];
                            }
                           
                            // 2.3.
                            // send STUN answer back
                            // keep data.seqno as stun initiator
                            sendOpcMsg(mineclnt, data);
                            
                            // 2.3.1
                            // emit event with initiator
                            self.emit('NS.SEP.SEP_OPC_PUNCH_ANSWER', {client: mineclnt, data: data});
                        });
                    } else {
					    data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                        data.answer.ready =false;
                        
                        // 2.2
                        // find connection of initiator
                        // TBD... mine client load balance 
                         /*var ck = data.offer.mine.ip+data.offer.mine.port;
                        for (var sk in self.conn) {
                            if (ck in self.conn[sk]) {
                                mineclnt = (self.conn[sk])[ck];
                                break;
                            }
                        }*/
                        if (data.offer.isInitiator) {
                            // current client is initiator
                            mineclnt = client; 
                        } else {
                            // peer client is initiator
                            mineclnt = (self.conn[client.clntinfo.srvip+':'+client.clntinfo.srvport])
                                                 [data.offer.peer.ip+':'+data.offer.peer.port];
                        }

                        // 2.3.
                        // send STUN answer back
                        // keep data.seqno as stun initiator
                        sendOpcMsg(mineclnt, data);
                        
                        // 2.3.1
                        // emit event with initiator
                        self.emit('NS.SEP.SEP_OPC_PUNCH_ANSWER', {client: mineclnt, data: data});
                    }
                    break;
                // offer/answer opc <- /////////////////////////////////////////////
                
                // user management opc -> //////////////////////////////////////////
                case SEP.SEP_OPC_CLNT_SDP_OFFER:
                    // 1.
                    // check if user was allowed to query it
                    // TBD...
                    
                    // 2.
                    // query sdp info
                    Sdp.getSdpByClnt(('string' === typeof data.offer.clnt) ?
                                      data.offer.clnt : Sdp.genClntid(data.offer.clnt),
                                      function(err, sdps){
                        // 3.
                        // send back CLNT_SDP answer
                        data.opc    = SEP.SEP_OPC_CLNT_SDP_ANSWER;
                        data.answer = {};
                        
                        if (err) {
                            console.log(err+',query sdp session failed');
                            // send back sdp session as answer
                            data.answer.sdps  = [];
                            data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                        } else {
                            // send back real sdp session as answer
                            data.answer.sdps  = sdps;
                            data.answer.state = SEP.SEP_OPC_STATE_READY;
                        }
                        sendOpcMsg(client, data);
                        
                        // 3.1
                        // emit event
                        self.emit('NS.SEP.SEP_OPC_CLNT_SDP_OFFER', {client: mineclnt, data: data});
                    });
                    break;
                    
                case SEP.SEP_OPC_ALL_USR_OFFER:
                    // 1.
                    // check if user was allowed to query it
                    // TBD... disable it by now
                    if (1) {
                        data.opc    = SEP.SEP_OPC_ALL_USR_ANSWER;
	                    data.answer = {};
	                        
                        console.log(err+',query user info failed');
                        // send back user info session as answer
                        data.answer.usrs = [];
                        data.answer.state  = SEP.SEP_OPC_STATE_FAIL;
                        
                        sendOpcMsg(client, data);
                        
                        // 1.1
                        // emit event
                        self.emit('NS.SEP.SEP_OPC_ALL_USR_OFFER', {client: mineclnt, data: data});
                    } else {
	                    // 2.
	                    // query login info
	                    Sdp.getAllUsrs(function(err, usrs){                        
	                        // 3.
	                        // send back ALL_USR answer
	                        data.opc    = SEP.SEP_OPC_ALL_USR_ANSWER;
	                        data.answer = {};
	                        
	                        if (err) {
	                            console.log(err+',query user info failed');
	                            // send back user info session as answer
	                            data.answer.usrs = [];
	                            data.answer.state  = SEP.SEP_OPC_STATE_FAIL;
	                        } else {
	                            // send back real user info as answer
	                            data.answer.usrs  = usrs;
	                            data.answer.state = SEP.SEP_OPC_STATE_READY;
	                        }
	                        sendOpcMsg(client, data);
	                        
	                        // 3.1
	                        // emit event
	                        self.emit('NS.SEP.SEP_OPC_ALL_USR_OFFER', {client: mineclnt, data: data});
	                    });
                    }
                    break;
                    
                case SEP.SEP_OPC_ALL_LOGIN_OFFER:
                    // 1.
                    // check if user was allowed to query it
                    // TBD... disable it by now
                    if (1) {
                        data.opc    = SEP.SEP_OPC_ALL_LOGIN_ANSWER;
	                    data.answer = {};
	                        
                        console.log(err+',query all login session failed');
                        // send back login session as answer
                        data.answer.logins = [];
                        data.answer.state  = SEP.SEP_OPC_STATE_FAIL;
                        
                        sendOpcMsg(client, data);
	                        
                        // 1.1
                        // emit event
                        self.emit('NS.SEP.SEP_OPC_ALL_LOGIN_OFFER', {client: client, data: data});
                    } else {
	                    // 2.
	                    // query login info
	                    Sdp.getAllLogin(function(err, logins){
	                        // 3.
	                        // send back ALL_LOGIN answer
	                        data.opc    = SEP.SEP_OPC_ALL_LOGIN_ANSWER;
	                        data.answer = {};
	                        
	                        if (err) {
	                            console.log(err+',query all login session failed');
	                            // send back login session as answer
	                            data.answer.logins = [];
	                            data.answer.state  = SEP.SEP_OPC_STATE_FAIL;
	                        } else {
	                            // send back real logins session as answer
	                            data.answer.logins = logins;
	                            data.answer.state  = SEP.SEP_OPC_STATE_READY;
	                        }
	                        sendOpcMsg(client, data);
	                        
	                        // 3.1
	                        // emit event
	                        self.emit('NS.SEP.SEP_OPC_ALL_LOGIN_OFFER', {client: client, data: data});
	                    });
                    }
                    break;
                
                case SEP.SEP_OPC_USR_LOGIN_OFFER:
                    // 1.
                    // check if user was allowed to query it
                    // TBD...
                    
                    // 2.
                    // query login info
                    Sdp.getLoginByUsr(('string' === typeof data.offer.peer) ?
                                       data.offer.peer : Sdp.genUsrid(data.offer.peer),
                                       function(err, logins){
                        // 3.
                        // send back USR_LOGIN answer
                        data.opc    = SEP.SEP_OPC_USR_LOGIN_ANSWER;
                        data.answer = {};
                        
                        if (err) {
                            console.log(err+',query login session failed');
                            // send back login session as answer
                            data.answer.logins = [];
                            data.answer.state  = SEP.SEP_OPC_STATE_FAIL;
                        } else {
                            // send back real logins session as answer
                            data.answer.logins = logins;
                            data.answer.state  = SEP.SEP_OPC_STATE_READY;
                        }
                        sendOpcMsg(client, data);
                        
                        // 3.1
                        // emit event
                        self.emit('NS.SEP.SEP_OPC_USR_LOGIN_OFFER', {client: client, data: data});
                    });
                    
                    break;
                // user management opc <- //////////////////////////////////////////
                
                // service management opc -> //////////////////////////////////////////
                case SEP.SEP_OPC_SRV_REPORT_OFFER:
                    // 1.
                    // check on user for authentication
                    // only allow user connect to user-self and public user
                    // TBD... Policy-Based_ACL
                    if (client.clntinfo && client.clntinfo.domain && client.clntinfo.usrkey &&
                        // 1.1
                        // !!! allow connect to user-self
                        ((client.clntinfo.domain === data.offer.srv.domain && client.clntinfo.usrkey === data.offer.srv.usrkey) || 
                        // 1.2
                        // !!! allow connect to public user 
                         (client.clntinfo.domain === data.offer.srv.domain && 'public' === data.offer.srv.usrkey))) {
                    } else {
                        console.log('!!!DDOS attack,no permission to report service info');
                        
                        data.opc    = SEP.SEP_OPC_SRV_REPORT_ANSWER;
                        data.answer = {};
                        
                        data.answer.info  = null;
                        data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                        
                        // close after 2s
                        sendOpcMsg(client, data, function(err){
                            if (err) console.log(err+'sendOpcMsg failed');
                            
                            setTimeout(function(){
                                if (client && client.close) client.close();                                    
                            }, 2000); // 2s timeout
                        });
                        
                    	// 1.3
                        // emit event
                        self.emit('NS.SEP.SEP_OPC_SRV_REPORT_OFFER', {client: client, data: data});   
                        
                        break;                 
                    }
                    
                    // 1.6
                    // notes: only support usrkey:unlockcn launched from China
                    if ((client.clntinfo.usrkey === 'unlockcn') && !(client.clntinfo.clntgeoip && client.clntinfo.clntgeoip.country === 'CN')) {
                        console.log('!!!unlockcn export service can be only run from China');
                        
                        data.opc    = SEP.SEP_OPC_SRV_REPORT_ANSWER;
                        data.answer = {};
                        
                        data.answer.info  = '!!!unlockcn export service can be only run from China';
                        data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                        
                        // close after 2s
                        sendOpcMsg(client, data, function(err){
                            if (err) console.log(err+'sendOpcMsg failed');
                            
                            setTimeout(function(){
                                if (client && client.close) client.close();                                    
                            }, 2000); // 2s timeout
                        });
                        
                    	// 1.6.1
                        // emit event
                        self.emit('NS.SEP.SEP_OPC_SRV_REPORT_OFFER', {client: client, data: data});   
                        
                        break;                 
                    }
                    
                    // 2.
                    // record service info
                    // notes: bridge to another service manager by now
                    // TBD... record it in geo-graph database

                    // 2.1
                    // set live flag true
                    data.offer.srv.live = true;

                    // 2.2
                    // set geoIP info
                    // !!! for security, only return country/city of GeoIP to client
                    data.offer.srv.geoip         = {};
                    data.offer.srv.geoip.country = client.clntinfo.clntgeoip.country;
                    data.offer.srv.geoip.city    = client.clntinfo.clntgeoip.city;

                    peerService.put(data.offer.srv, function(err, srv){                        
                    	// 3.
                        // send back answer
                        data.opc    = SEP.SEP_OPC_SRV_REPORT_ANSWER;
                        data.answer = {};
                        
                        if (err) {
                            console.log(err+',record service info failed');
                            data.answer.srv   = data.offer.srv;
                            data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                        } else {
                            // send back service info as answer
                            data.answer.srv   = srv;
                            data.answer.state = SEP.SEP_OPC_STATE_READY;
                        }
                        sendOpcMsg(client, data);
                        
                        // 3.1
                        // emit event
                        self.emit('NS.SEP.SEP_OPC_SRV_REPORT_OFFER', {client: client, data: data});
                    });
                    break;
                    
                case SEP.SEP_OPC_SRV_UPDATE_OFFER:
                    // 1.
                    // check on user for authentication
                    // only allow user connect to user-self and public user
                    // TBD... Policy-Based_ACL
                    if (client.clntinfo && client.clntinfo.domain && client.clntinfo.usrkey &&
                        // 1.1
                        // !!! allow connect to user-self
                        ((client.clntinfo.domain === data.offer.srv.domain && client.clntinfo.usrkey === data.offer.srv.usrkey) || 
                        // 1.2
                        // !!! allow connect to public user 
                         (client.clntinfo.domain === data.offer.srv.domain && 'public' === data.offer.srv.usrkey))) {
                    } else {
                        console.log('!!!DDOS attack,no permission to update service info');
                        
                        data.opc    = SEP.SEP_OPC_SRV_UPDATE_ANSWER;
                        data.answer = {};
                        
                        data.answer.info  = null;
                        data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                        
                        // close after 2s
                        sendOpcMsg(client, data, function(err){
                            if (err) console.log(err+'sendOpcMsg failed');
                            
                            setTimeout(function(){
                                if (client && client.close) client.close();                                    
                            }, 2000); // 2s timeout
                        });
                        
                    	// 1.3
                        // emit event
                        self.emit('NS.SEP.SEP_OPC_SRV_UPDATE_OFFER', {client: client, data: data});   
                        
                        break;                 
                    }
                    
                    // 1.6
                    // notes: only support usrkey:unlockcn launched from China
                    if ((client.clntinfo.usrkey === 'unlockcn') && !(client.clntinfo.clntgeoip && client.clntinfo.clntgeoip.country === 'CN')) {
                        console.log('!!!unlockcn export service can be only run from China');
                        
                        data.opc    = SEP.SEP_OPC_SRV_UPDATE_ANSWER;
                        data.answer = {};
                        
                        data.answer.info  = '!!!unlockcn export service can be only run from China';
                        data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                        
                        // close after 2s
                        sendOpcMsg(client, data, function(err){
                            if (err) console.log(err+'sendOpcMsg failed');
                            
                            setTimeout(function(){
                                if (client && client.close) client.close();                                    
                            }, 2000); // 2s timeout
                        });
                        
                    	// 1.6.1
                        // emit event
                        self.emit('NS.SEP.SEP_OPC_SRV_UPDATE_OFFER', {client: client, data: data});   
                        
                        break;                 
                    }
                                        
                    // 2.
                    // update service info
                    // notes: bridge to another service manager by now
                    // TBD... update it in geo-graph database

                    // 2.1
                    // keep geoIP info
                    // !!! for security, only return country/city of GeoIP to client
                    data.offer.srv.geoip         = {};
                    data.offer.srv.geoip.country = client.clntinfo.clntgeoip.country;
                    data.offer.srv.geoip.city    = client.clntinfo.clntgeoip.city;

                    peerService.put(data.offer.srv, function(err, srv){                        
                        // 3.
                        // send back answer
                        data.opc    = SEP.SEP_OPC_SRV_UPDATE_ANSWER;
                        data.answer = {};
                        
                        if (err) {
                            console.log(err+',update service info failed');
                            data.answer.srv   = data.offer.srv;
                            data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                        } else {
                            // send back service info as answer
                            data.answer.srv   = srv;
                            data.answer.state = SEP.SEP_OPC_STATE_READY;
                        }
                        sendOpcMsg(client, data);
                        
                        // 3.1
                        // emit event
                        self.emit('NS.SEP.SEP_OPC_SRV_UPDATE_OFFER', {client: client, data: data});
                    });
                    break;     
                    
                case SEP.SEP_OPC_SRV_QUERY_OFFER:
                    // 1.
                    // check on user for authentication
                    // only allow user connect to user-self and public user
                    // TBD... Policy-Based_ACL
                    if (client.clntinfo && client.clntinfo.domain && client.clntinfo.usrkey &&
                        // 1.1
                        // !!! allow connect to user-self
                        ((client.clntinfo.domain === data.offer.srv.domain && client.clntinfo.usrkey === data.offer.srv.usrkey) || 
                        // 1.2
                        // !!! allow connect to public user 
                         (client.clntinfo.domain === data.offer.srv.domain && 'public' === data.offer.srv.usrkey))) {
                    } else {
                        console.log('!!!DDOS attack,no permission to query service info');
                        data.opc    = SEP.SEP_OPC_SRV_QUERY_ANSWER;
                        data.answer = {};
                        
                        data.answer.info  = null;
                        data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                        
                        // close after 2s
                        sendOpcMsg(client, data, function(err){
                            if (err) console.log(err+'sendOpcMsg failed');
                            
                            setTimeout(function(){
                                if (client && client.close) client.close();                                    
                            }, 2000); // 2s timeout
                        });
                        
                    	// 1.3
                        // emit event
                        self.emit('NS.SEP.SEP_OPC_SRV_QUERY_OFFER', {client: client, data: data});
                        
                        break;
                    }
                    
                    // 2.
                    // query service info
                    // notes: ask for another service manager by now
                    // TBD... query it in geo-graph database
                    peerService.get(data.offer.srv, function(err, srv){                        
                        // 3.
                        // send back answer
                        data.opc    = SEP.SEP_OPC_SRV_QUERY_ANSWER;
                        data.answer = {};
                        
                        if (err) {
                            console.log(err+',query service info failed');
                            data.answer.srv   = data.offer.srv;
                            data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                        } else {
                        	// send back service info as answer
                        	data.answer.srv   = srv;
                        	data.answer.state = SEP.SEP_OPC_STATE_READY;

                        	// !!! for security, only return country/city of GeoIP to client
                        	var geoip_     = {};
                        	geoip_.country = srv.geoip.country;
                        	geoip_.city    = srv.geoip.city;

                        	data.answer.srv.geoip = geoip_;
                        }
                        sendOpcMsg(client, data);
                        
                        // 3.1
                        // emit event
                        self.emit('NS.SEP.SEP_OPC_SRV_QUERY_OFFER', {client: client, data: data});
                    });                    
                    break;                               
                                        
                // service management opc <- //////////////////////////////////////////
                
                // vURL management opc -> /////////////////////////////////////////////                
                case SEP.SEP_OPC_VURL_INFO_OFFER:
                    // 1.
                    // check on user for authentication
                    // by now only support user-self
                    // TBD... Policy-Based_ACL
                    
                    // 2.
                    // get vURL info
                    vURL.get(data.offer.vurl, function(err, routing){		                                        
                        // 3.
                        // send back answer
                        data.opc    = SEP.SEP_OPC_VURL_INFO_ANSWER;
                        data.answer = {};
                        
                        if (err || !routing) {
                            console.log(err+',get vURL info failed');
                            data.answer.info  = null;
                            data.answer.state = SEP.SEP_OPC_STATE_FAIL;
                            
                            sendOpcMsg(client, data);
                        } else {
                            // 3.1
                            // check on user for authentication
		                    // only allow user connect to user-self and public user
		                    // TBD... Policy-Based_ACL
                            if (client.clntinfo && client.clntinfo.domain && client.clntinfo.usrkey &&
                                routing.usrinfo && routing.usrinfo.domain && routing.usrinfo.usrkey &&
                                 // 3.1.1
                                 // !!! allow connect to user-self
                                ((client.clntinfo.domain === routing.usrinfo.domain && client.clntinfo.usrkey === routing.usrinfo.usrkey) || 
                                 // 3.1.2
                                 // !!! allow connect to public user 
                                 (client.clntinfo.domain === routing.usrinfo.domain && 'public' === routing.usrinfo.usrkey))) {
	                            // send back vURL info as answer
	                            // notes: don't pass usrinfo/seckeys back
	                            data.answer.info = {};
	                            Object.keys(routing).forEach(function(k){
	                                if (k !== 'seckeys' && k !== 'usrinfo') 
	                                    data.answer.info[k] = routing[k];     
	                            });
	                            
	                            data.answer.state = SEP.SEP_OPC_STATE_READY;
	                                  
	                            sendOpcMsg(client, data);      
                            } else {
	                            console.log('!!!DDOS attack,no permission to get vURL info');
	                            data.answer.info  = null;
	                            data.answer.state = SEP.SEP_OPC_STATE_FAIL;
	                            
	                            // close after 2s
	                            sendOpcMsg(client, data, function(err){
	                                if (err) console.log(err+'sendOpcMsg failed');
	                                
	                                setTimeout(function(){
	                                    if (client && client.close) client.close();                                    
	                                }, 2000); // 2s timeout
                                });
                            }
                        }
                        
                        // 3.2
                        // emit event
                        self.emit('NS.SEP.SEP_OPC_VURL_INFO_OFFER', {client: client, data: data});
                    });
                    break;                                    
                // vURL management opc <- //////////////////////////////////////////
                                
                default:
                    console.log('unknown opc:'+JSON.stringify(data));
                    break;
                }
            } else {
                console.log('unknown message:'+JSON.stringify(data));    
            }
            
         } catch (e) {
             console.error('Name-server ignore caught message-handle exception '+e);
         }
         
        });
        
        // onClose handler
        client.on('close', function(){
            // 1.
            // clear client Node and SDP/STUN/TURN sessions in DB
            if (Debug) console.log('client.onClose:'+JSON.stringify(client.clntinfo));
            if (client.clntinfo) {
                try {
	                // 1.1
	                // emit event
	                self.emit('NS.client.close', {clntinfo: client.clntinfo});
	            
	                // 2.
	                // clear client connection cache
	                var ck = client.clntinfo.clntip+':'+client.clntinfo.clntport,
	                    sk = client.clntinfo.srvip+':'+client.clntinfo.srvport;
	                if (Debug) console.log('ck:'+ck+',sk:'+sk+',self.conn[sk][ck]:'+(self.conn[sk])[ck]);
	                if (self.conn[sk] && (self.conn[sk])[ck] && client.clntinfo.gid) {
	                    // Never clear data on DB, just set live flag as false
	                    /*Sdp.db.delClient(client.clntinfo.gid, function(err){
	                        if (err) console.log(err+',clear client with session failed @'+client.clntinfo.gid+'@srv:'+sk);
	                        if (Debug) console.log('clear client with sessions successfully @'+client.clntinfo.gid+',@srv:'+sk);
	                    }, true);*/
	                    // client data
	                    Sdp.updateClntInfo({gid: client.clntinfo.gid, live: false}, function(err){
	                        if (err) console.log(err+',clear client with session failed @'+client.clntinfo.gid+'@srv:'+sk);
	                        if (Debug) console.log('clear client with sessions successfully @'+client.clntinfo.gid+',@srv:'+sk);
	                    
	                        client.clntinfo = null;
	                        (self.conn[sk])[ck] = null;
                            });
	                }
                } catch (e) {
                    console.log('Ignore onClose exceptions');
                }
            }
        });
        
        // onError handler
        client.on('error', function(){
            // force to close
            // notes: let low layer to handle it
            ///client.close();
            
            // 1.
            // clear client Node and SDP/STUN/TURN sessions in DB
            if (Debug) console.log('client.onError:'+JSON.stringify(client.clntinfo));
            if (client.clntinfo) {
                try {
	                // 1.1
	                // emit event
	                self.emit('NS.client.error', {clntinfo: client.clntinfo});
	                
	                // 2.
	                // clear client connection cache
	                var ck = client.clntinfo.clntip+':'+client.clntinfo.clntport,
	                    sk = client.clntinfo.srvip+':'+client.clntinfo.srvport;
	                if (Debug) console.log('ck:'+ck+',sk:'+sk+',self.conn[sk][ck]:'+(self.conn[sk])[ck]);
	                if (self.conn[sk] && (self.conn[sk])[ck] && client.clntinfo.gid) {
	                    // Never clear data on DB, just set live flag as false
	                    /*Sdp.db.delClient(client.clntinfo.gid, function(err){
	                        if (err) console.log(err+',clear client with session failed @'+client.clntinfo.gid+'@srv:'+sk);
	                        if (Debug) console.log('clear client with sessions successfully @'+client.clntinfo.gid+',@srv:'+sk);
	                    }, true);*/                    
	                    Sdp.updateClntInfo({gid: client.clntinfo.gid, live: false}, function(err){
	                        if (err) console.log(err+',clear client with session failed @'+client.clntinfo.gid+'@srv:'+sk);
	                        if (Debug) console.log('clear client with sessions successfully @'+client.clntinfo.gid+',@srv:'+sk);
	                    });
	                    
	                    client.clntinfo = null;                        
	                    (self.conn[sk])[ck] = null;
	                }
                } catch (e) {
                    console.log('Ignore onClose exceptions');
                }
            }
        });
    }
    
    // start name servers 
    // TBD... run in Domain
    var httppsrvn;
    for (var i = 0, srv = {}; i < self.ports.length; i ++) {
    	if (self.sslcerts.ns)
    		httppsrvn = httpps.createServer(self.sslcerts.ns);
    	else
    		httppsrvn = httpp.createServer();	

    	// check on secure websocket
    	if (self.naclcerts && self.naclcerts.ns)
    		srv = new SecureWebSocketServer({
    		 httpp: true, 
    		server: httppsrvn, 
    		  path: SEP.SEP_CTRLPATH_NS
    	}, 
    	{
    			    version: 2,
    			       cert: self.naclcerts.ns.cert,
    			         ca: self.naclcerts.ca.cert,
    			requireCert: false,

    			myPublicKey: Naclcert.ArrayToUint8(self.naclcerts.ns.key.publickey),
    			mySecretKey: Naclcert.ArrayToUint8(self.naclcerts.ns.key.secretkey)
    	});
    	else
    		srv = new WebSocketServer({httpp: true, server: httppsrvn, path: SEP.SEP_CTRLPATH_NS});

    	self.srvs[self.ipaddr+':'+self.ports[i]] = {
    			host: self.ipaddr, 
    			port: self.ports[i],

    			srv: srv, 
    			httppsrv: httppsrvn,

    			path: SEP.SEP_CTRLPATH_NS,

    			cert: self.sslcerts.ns
    	};

    	srv.on('connection', onConnection);

    	// name server
    	// backlog 10K TBD...
    	httppsrvn.listen(self.ports[i], self.ipaddr);
    	console.log('name-server-'+i+' listen on udp port '+self.ports[i]);
    }
    
    // start turn server
    if (self.turnPorts) {
        // 1.
        // Proxy httpp and http server
        
        // 1.1
        // create proxy cache, history
        self.turnProxyCache = {}; // proxy cache
        self.trunProxyHistory = {}; // proxy history
        
		// 1.2
		// setup server to proxy standard HTTP requests on both tcp and udp port		
		var proxyHttpService = function(req, res) {
		    var vurle, vstrs, urle = req.url;
		    
		    // 1.2.1
		    // match vURL pattern:
		    // - vhost like http(s)://"xxx.vurl."iwebpp.com
		    // - vpath like http(s)://iwebpp.com"/vurl/xxx"
		    if (vstrs = req.headers.host.match(vurl.regex_vhost)) {
		        vurle = vstrs[0];
		        if (Debug) console.log('proxy for client with vhost:'+vurle);
		    } else if (vstrs = req.url.match(vurl.regex_vpath)) {
			    vurle = vstrs[0];	       
			    
			    // prune vpath in req.url
                req.url = req.url.replace(vurle, '');
			         
			    if (Debug) console.log('proxy for client with vpath:'+vurle);
		    } else {
		        // invalid vURL
		        res.writeHead(400);
                res.end('invalid URL');
                console.error('invalid URL:'+urle);
                return;
		    }
    
		    if (Debug) console.log('Http request proxy for client request.headers:'+JSON.stringify(req.headers)+
		                           ',url:'+urle+',vurl:'+vurle);

	        // 1.2.2
	        // fetch peer target host info via vURL
            vURL.get(vurle, function(err, routing){
                if (err || !routing) {
                    res.writeHead(400);
                    res.end('invalid vURL');
                    console.error(err+'invalid URL:'+urle);
                    return;
                }
                
                // 1.2.3
		        // cache proxy
		        if (!self.turnProxyCache[vurle]) {
                    // fill destination name-client info and create proxy to peer target
		            self.turnProxyCache[vurle] = new httppProxy.HttpProxy({
		                ///httpp: false,
		                https: self.sslcerts.ps || false,
		                changeOrigin: false,
	                    enable: {xforward: true},
		                
		                ///source: {host: 'localhost', port: self.turnPorts[0]},
		                  
		                target: {
		                    httpp: true,
		                    
		                    // set SSL related info
		                    https: routing.secmode ? {
                                rejectUnauthorized: true, 
                                                ca: self.sslcerts.ca.cont, 
                                               key: self.sslcerts.as.key,
                                              cert: self.sslcerts.as.cert
                            } : false, 
		                    
		                    host: routing.dst.ipaddr,
		                    port: routing.dst.port,
		                    
		                    // set user-specific feature,like maxim bandwidth,etc
		                    // TBD... with user DB
		                    localAddress: {
		                        addr: routing.turn.lipaddr,
		                        port: routing.turn.agentport,
		                        
		                         opt: {
		                            mbw: self.option.mbw || null
		                        }
		                    }
		                }
		            });
		            
				    // Handle request error
				    self.turnProxyCache[vurle].on('proxyError', function(err, req, res){
				        if (Debug) console.error(err+',proxy to '+urle);
				        
				        // send error back
				        try {
				            res.writeHead(500, {'Content-Type': 'text/plain'});
						    if (req.method !== 'HEAD') {
					            if (process.env.NODE_ENV === 'production') {
					                res.write('Internal Server Error');
					            } else {
					                res.write('An error has occurred: ' + JSON.stringify(err));
					            }
					        }
				            res.end();
				        } catch (ex) {
				            console.error("res.end error: %s", ex.message) ;
				        }
				        
	                    // clear vURL entry
	                    // notes: still keep it to avoid attack
	                    ///self.turnProxyCache[vurle] = null;
	                });
	                
	                // Handle upgrade error
				    self.turnProxyCache[vurle].on('webSocketProxyError', function(err, req, socket, head){
				        if (Debug) console.error(err+',proxy to '+urle);
				        
				        // send error back
				        try {
				            if (process.env.NODE_ENV === 'production') {
				                socket.write('Internal Server Error');
				            } else {
				                socket.write('An error has occurred: ' + JSON.stringify(err));
				            }
				            socket.end();
				        } catch (ex) {
				            console.error("socket.end error: %s", ex.message) ;
				        }
				        
				        // clear vURL entry
				        // notes: still keep it to avoid attack
	                    ///self.turnProxyCache[vurle] = null;
	                });
		        }
		        
	            // 1.2.5
	            // proxy target
	            self.turnProxyCache[vurle].proxyRequest(req, res);
		    });
		};
		
		// 1.3
		// create http proxy service
		
		// 1.3.1
		// create http proxy App
	    var proxyHttpApp = Connect();
	    
	    // 1.3.2
	    // add third-party connect middle-ware
	    
	    // 1.3.2.1
	    // set httpp capacity for turn/proxy server
	    proxyHttpApp.use(connect_httpp(self.turnPorts[0]));
	    
	    // 1.3.2.2
	    // vtoken authentication
	    proxyHttpApp.use(function(req, res, next){
		    var vurle, vstrs, urle = req.url;
		    
		    // 1.
		    // match vURL pattern:
		    // - vhost like http(s)://"xxx.vurl."iwebpp.com
		    // - vpath like http(s)://iwebpp.com"/vurl/xxx"
		    if (vstrs = req.headers.host.match(vurl.regex_vhost)) {
		        vurle = vstrs[0];
		        if (Debug) console.log('proxy for client with vhost:'+vurle);
		    } else if (vstrs = req.url.match(vurl.regex_vpath)) {
			    vurle = vstrs[0];
			    if (Debug) console.log('proxy for client with vpath:'+vurle);
		    } else {
		        // invalid vURL
		        res.writeHead(400);
                res.end('invalid URL');
                console.error('invalid URL:'+urle);
                return;
		    }
    
		    if (Debug) console.log('Http request proxy for client request.headers:'+JSON.stringify(req.headers)+
		                           ',url:'+urle+',vurl:'+vurle);

	        // 2.
	        // fetch peer target host info via vURL
            vURL.get(vurle, function(err, routing){
                if (err || !routing) {
                    res.writeHead(400);
                    res.end('invalid vURL');
                    console.error(err+'invalid URL:'+urle);
                    return;
                }
                                
		        // 3.
		        // check vURL security token in case name-client in ACL-based secure vURL mode
		        // notes: only check host-only-based token authentication here
		        if (routing.secmode > SEP.SEP_SEC_SSL) {
			        var curtime = Date.now();
			        var phk = req.connection.remoteAddress+':'+vurle;
			        
			        if (Debug) console.log('peer host key:'+phk);
			        
			        self.trunProxyHistory[phk] = self.trunProxyHistory[phk] ||
			                                     {timestamp: Date.now(), state: 0, trys: 0, maxTrys: 6, timeOut: 6};
			        		                                     
			        // 3.1
			        // allow authenticated host
			        if (self.trunProxyHistory[phk].state > 0) {
			            // update timestamp
			            self.trunProxyHistory[phk].timestamp = curtime;
			            
			            // !!! rewrite req.url to remove vToken parts
			            req.url = req.url.replace(vurl.regex_vtoken, '');
			            
			            // go on to proxy
			            next();
			        } else {
			            // 3.2
			            // check reject timer
			            if (self.trunProxyHistory[phk].state < 0) {
			                if (curtime < (self.trunProxyHistory[phk].timestamp + self.trunProxyHistory[phk].timeOut*1000*
			                               (self.trunProxyHistory[phk].trys ? self.trunProxyHistory[phk].trys : 1))) {
			                    // reject
			                    res.writeHead(400);
	                            res.end('please try later');
	                            return;
			                } else {
			                    // reset state/trys
			                    self.trunProxyHistory[phk].state = 0;
			                    self.trunProxyHistory[phk].trys = 0;
			                    self.trunProxyHistory[phk].timestamp = curtime;
			                    
			                    // go on to authenticate
			                }
			            }
			            
			            // 3.3
			            // check re-try
			            if (self.trunProxyHistory[phk].trys > self.trunProxyHistory[phk].maxTrys) {
			                // update timestamp
			                self.trunProxyHistory[phk].timestamp = curtime;
			                
			                // set reject 
			                self.trunProxyHistory[phk].state = -1;
			                
			                // reject
			                res.writeHead(400);
	                        res.end('please try later');
	                        return;
			            } else {
			                // 3.4
			                // check vToken URL path like /vtoken/xxxx
			                var urlstr = urle.match(vurl.regex_vtoken);
			                var ptoken = urlstr ? urlstr[0].split(/\//gi)[2] : '';
			                var vtoken = SIPHASH.hash_hex(routing.seckeys, routing.vurl);
			                
			                if (ptoken === vtoken) {		                    
			                    // set pass 
			                    self.trunProxyHistory[phk].state = 1;
			                    
			                    // update timestamp
			                    self.trunProxyHistory[phk].timestamp = curtime;
			                    
			                    // !!! rewrite req.url to remove vToken parts
			                    req.url = req.url.replace(vurl.regex_vtoken, '');
			                    
			                    // go on to proxy
			                    next();
			                } else {
			                    // increase re-try count
			                    self.trunProxyHistory[phk].trys ++;
			                    
			                    // update timestamp
			                    self.trunProxyHistory[phk].timestamp = curtime;
			                    
			                    // retry
			                    res.writeHead(400);
	                            res.end('please try later');
	                            return;
			                }
			            }
			        }
		        } else {
		            // go on to proxy
		            next();
		        }
	        });	    
	    });
	    
	    // 1.3.2.2
	    // compress
	    // TBD...
	    ///proxyHttpApp.use(Connect.compress());
	    
	    // 1.3.2.3
	    // static-cache, ...
	    // TBD...
	    ///proxyHttpApp.use(Connect.staticCache({maxLength: 1024*1024, maxObjects: 128}));
	    
	    // 1.3.3
	    // add http proxy service in App
	    proxyHttpApp.use(proxyHttpService);
	    
		// 1.4
		// create httpp/http proxy server
		var proxyServerHttpp = self.sslcerts.ps ?
		                       httpps.createServer(self.sslcerts.ps, proxyHttpApp) :
		                       httpp.createServer(proxyHttpApp);
		                       
		var proxyServerHttp  = self.sslcerts.ps ?
		                       https.createServer(self.sslcerts.ps, proxyHttpApp) :
		                       http.createServer(proxyHttpApp);
		
		// 1.5
		// listen to the `upgrade` event and proxy the WebSocket requests as well.
		var proxyHttpUpgradeService = function (req, socket, head) {
		    var vurle, vstrs, urle = req.url;
		    
		    // 1.5.1
		    // match vURL pattern:
		    // - vhost like http(s)://xxx.vurl.iwebpp.com
		    // - vpath like http(s)://iwebpp.com/vurl/xxx
		    if (vstrs = req.headers.host.match(vurl.regex_vhost)) {
		        vurle = vstrs[0];
		        if (Debug) console.log('proxy for client with vhost:'+vurle);
		    } else if (vstrs = req.url.match(vurl.regex_vpath)) {
			    vurle = vstrs[0];
			    
			    // prune vpath in req.url
                req.url = req.url.replace(vurle, '');
	            				
			    if (Debug) console.log('proxy for client with vpath:'+vurle);
		    } else {
		        // unknown vURL
		        socket.end('invalid URL');
                console.error('invalid vURL:'+urle);
                return;
		    }
    
		    if (Debug) console.log('Http upgrade proxy for client request.headers:'+JSON.stringify(req.headers)+
		                           ',url:'+urle+',vurl:'+vurle);
		    
	        // 1.5.2
	        // fetch peer target host info via vURL
            vURL.get(vurle, function(err, routing){
                if (err || !routing) {
                    socket.end('invalid URL');
                    console.error(err+'invalid vURL:'+vurle);
                    return;
                }
                
                // 1.5.3
		        // cache proxy
		        if (!self.turnProxyCache[vurle]) {
                    // fill destination name-client info and create proxy to peer target
		            self.turnProxyCache[vurle] = new httppProxy.HttpProxy({
		                ///httpp: false,
		                https: self.sslcerts.ps || false,
		                changeOrigin: false,
	                    enable: {xforward: true},
		                
		                ///source: {host: 'localhost', port: self.turnPorts[0]},
		                 
		                target: {
		                    httpp: true, 
		                    
		                    // set SSL related info
		                    https: routing.secmode ? {
                                rejectUnauthorized: true, 
                                                ca: self.sslcerts.ca.cont, 
                                               key: self.sslcerts.as.key,
                                              cert: self.sslcerts.as.cert
                            } : false, 
		                    
		                    host: routing.dst.ipaddr,
		                    port: routing.dst.port,
		                    
		                    // set user-specific feature,like maxim bandwidth,etc
		                    // TBD... with user DB
		                    localAddress: {
		                        addr: routing.turn.lipaddr,
		                        port: routing.turn.agentport, 
		                        
		                         opt: {
		                            mbw: self.option.mbw || null
		                        }
		                    }
		                }
		            });
		            
		            // Handle request error
				    self.turnProxyCache[vurle].on('proxyError', function(err, req, res){
				        if (Debug) console.error(err+',proxy to '+urle);
				        
				        // send error back
				        try {
				            res.writeHead(500, {'Content-Type': 'text/plain'});
						    if (req.method !== 'HEAD') {
					            if (process.env.NODE_ENV === 'production') {
					                res.write('Internal Server Error');
					            } else {
					                res.write('An error has occurred: ' + JSON.stringify(err));
					            }
					        }
				            res.end();
				        } catch (ex) {
				            console.error("res.end error: %s", ex.message) ;
				        }
				        
	                    // clear vURL entry
	                    // notes: still keep it to avoid attack
	                    ///self.turnProxyCache[vurle] = null;
	                });
	                
				    // Handle upgrade error
				    self.turnProxyCache[vurle].on('webSocketProxyError', function(err, req, socket, head){
				        if (Debug) console.error(err+',proxy to '+urle);
				        
				        // send error back
				        try {
				            if (process.env.NODE_ENV === 'production') {
				                socket.write('Internal Server Error');
				            } else {
				                socket.write('An error has occurred: ' + JSON.stringify(err));
				            }
				            socket.end();
				        } catch (ex) {
				            console.error("socket.end error: %s", ex.message) ;
				        }
				        
				        // clear vURL entry
				        // notes: still keep it to avoid attack
	                    ///self.turnProxyCache[vurle] = null;
	                });
		        }
		        
		        // 1.5.4
		        // check vURL security token in case name-client in ACL-based secure vURL mode
		        // notes: only check host-only-based token authentication here
		        if (routing.secmode > SEP.SEP_SEC_SSL) {
			        var curtime = Date.now();
			        var phk = socket.remoteAddress+':'+vurle;
			        
			        if (Debug) console.log('peer host key:'+phk);
			        
			        self.trunProxyHistory[phk] = self.trunProxyHistory[phk] ||
			                                     {timestamp: Date.now(), state: 0, trys: 0, maxTrys: 6, timeOut: 6};
			        		                                     
			        // 1.5.4.1
			        // allow authenticated host
			        if (self.trunProxyHistory[phk].state > 0) {
			            // update timestamp
			            self.trunProxyHistory[phk].timestamp = curtime;
			            
			            // !!! rewrite req.url to remove vToken parts
			            req.url = req.url.replace(vurl.regex_vtoken, '');
			            
			            // go on to proxy
			        } else {
			            // 1.5.4.2
			            // check reject timer
			            if (self.trunProxyHistory[phk].state < 0) {
			                if (curtime < (self.trunProxyHistory[phk].timestamp + self.trunProxyHistory[phk].timeOut*1000*
			                               (self.trunProxyHistory[phk].trys ? self.trunProxyHistory[phk].trys : 1))) {
			                    // reject
	                            socket.write('please try later');
	                            socket.end();
	                            return;
			                } else {
			                    // reset state/trys
			                    self.trunProxyHistory[phk].state = self.trunProxyHistory[phk].trys = 0;
			                    self.trunProxyHistory[phk].timestamp = curtime;
			                    
			                    // go on to authenticate
			                }
			            }
			            
			            // 1.5.4.3
			            // check re-try
			            if (self.trunProxyHistory[phk].trys > self.trunProxyHistory[phk].maxTrys) {
			                // update timestamp
			                self.trunProxyHistory[phk].timestamp = curtime;
			                
			                // set reject 
			                self.trunProxyHistory[phk].state = -1;
			                
			                // reject
			                socket.write('please try later');
	                        socket.end();
	                        return;
			            } else {
			                // 1.5.4.4
			                // check vToken URL path like /vtoken/xxxx
			                var urlstr = urle.match(vurl.regex_vtoken);
			                var ptoken = urlstr ? urlstr[0].split(/\//gi)[2] : '';
			                var vtoken = SIPHASH.hash_hex(routing.seckeys, routing.vurl);
			                
			                if (Debug) console.log('url:'+urle+',ptoken:'+ptoken+',vtoken:'+vtoken);
			                
			                if (ptoken === vtoken) {		                    
			                    // set pass 
			                    self.trunProxyHistory[phk].state = 1;
			                    
			                    // update timestamp
			                    self.trunProxyHistory[phk].timestamp = curtime;
			                    
			                    // !!! rewrite req.url to remove vToken parts
			                    req.url = req.url.replace(vurl.regex_vtoken, '');
			                    
			                    // go on to proxy
			                } else {
			                    // increase re-try count
			                    self.trunProxyHistory[phk].trys ++;
			                    
			                    // update timestamp
			                    self.trunProxyHistory[phk].timestamp = curtime;
			                    
			                    // retry
			                    socket.write('please try later');
	                            socket.end();
	                            return;
			                }
			            }
			        }
		        }
		        		        
		        // 1.5.5
		        // proxy target
		        self.turnProxyCache[vurle].proxyWebSocketRequest(req, socket, head);
		    });
		};
				
		// 1.5.6
		// create websocket proxy service	
		proxyServerHttpp.on('upgrade', proxyHttpUpgradeService);
		proxyServerHttp.on('upgrade', proxyHttpUpgradeService);
				
		// 1.6
		// http tunnel based on CONNECT method
		// notes: destination vURL in req.headers['turn-forward-to']
        var proxyHttpTunnelService = function (req, socket, head) {
		    var vurle, vstrs, urle = (req.headers && req.headers['turn-forward-to']);
		    
		    // check parameter
		    if (!urle) {
		        // unknown vURL
		        socket.end('invalid URL');
                console.error('invalid vURL:'+urle);
                return;
		    }
		    
		    // 1.6.1
		    // match vURL pattern:
		    // - vhost like http(s)://xxx.vurl.iwebpp.com
		    // - vpath like http(s)://iwebpp.com/vurl/xxx
		    if (vstrs = urle.match(vurl.regex_vhost)) {
		        vurle = vstrs[0];
		        if (Debug) console.log('proxy for client with vhost:'+vurle);
		    } else if (vstrs = urle.match(vurl.regex_vpath)) {
			    vurle = vstrs[0];	            				
			    if (Debug) console.log('proxy for client with vpath:'+vurle);
		    } else {
		        // unknown vURL
		        socket.end('invalid URL');
                console.error('invalid vURL:'+urle);
                return;
		    }
    
		    if (Debug) console.log('Http tunnel proxy for client request.headers:'+JSON.stringify(req.headers)+
		                           ',url:'+urle+',vurl:'+vurle);
		    
	        // 1.6.2
	        // fetch peer target host info via vURL
            vURL.get(vurle, function(err, routing){
                if (err || !routing) {
                    socket.end('invalid URL');
                    console.error(err+'invalid vURL:'+vurle);
                    return;
                }
                
                // 1.6.3
                // ...
                
		        // 1.6.4
		        // check vURL security token in case name-client in ACL-based secure vURL mode
		        // notes: only check host-only-based token authentication here
		        if (routing.secmode > SEP.SEP_SEC_SSL) {
			        var curtime = Date.now();
			        var phk = socket.remoteAddress+':'+vurle;
			        
			        if (Debug) console.log('peer host key:'+phk);
			        
			        self.trunProxyHistory[phk] = self.trunProxyHistory[phk] ||
			                                     {timestamp: Date.now(), state: 0, trys: 0, maxTrys: 6, timeOut: 6};
			        		                                     
			        // 1.6.4.1
			        // allow authenticated host
			        if (self.trunProxyHistory[phk].state > 0) {
			            // update timestamp
			            self.trunProxyHistory[phk].timestamp = curtime;
			            			            
			            // go on to proxy
			        } else {
			            // 1.6.4.2
			            // check reject timer
			            if (self.trunProxyHistory[phk].state < 0) {
			                if (curtime < (self.trunProxyHistory[phk].timestamp + self.trunProxyHistory[phk].timeOut*1000*
			                               (self.trunProxyHistory[phk].trys ? self.trunProxyHistory[phk].trys : 1))) {
			                    // reject
	                            socket.write('please try later');
	                            socket.end();
	                            return;
			                } else {
			                    // reset state/trys
			                    self.trunProxyHistory[phk].state = self.trunProxyHistory[phk].trys = 0;
			                    self.trunProxyHistory[phk].timestamp = curtime;
			                    
			                    // go on to authenticate
			                }
			            }
			            
			            // 1.6.4.3
			            // check re-try
			            if (self.trunProxyHistory[phk].trys > self.trunProxyHistory[phk].maxTrys) {
			                // update timestamp
			                self.trunProxyHistory[phk].timestamp = curtime;
			                
			                // set reject 
			                self.trunProxyHistory[phk].state = -1;
			                
			                // reject
			                socket.write('please try later');
	                        socket.end();
	                        return;
			            } else {
			                // 1.6.4.4
			                // check vToken URL path like /vtoken/xxxx
			                var urlstr = urle.match(vurl.regex_vtoken);
			                var ptoken = urlstr ? urlstr[0].split(/\//gi)[2] : '';
			                var vtoken = SIPHASH.hash_hex(routing.seckeys, routing.vurl);
			                
			                if (Debug) console.log('url:'+urle+',ptoken:'+ptoken+',vtoken:'+vtoken);
			                
			                if (ptoken === vtoken) {		                    
			                    // set pass 
			                    self.trunProxyHistory[phk].state = 1;
			                    
			                    // update timestamp
			                    self.trunProxyHistory[phk].timestamp = curtime;
			                    
			                    // go on to proxy
			                } else {
			                    // increase re-try count
			                    self.trunProxyHistory[phk].trys ++;
			                    
			                    // update timestamp
			                    self.trunProxyHistory[phk].timestamp = curtime;
			                    
			                    // retry
			                    socket.write('please try later');
	                            socket.end();
	                            return;
			                }
			            }
			        }
		        }
		        
		        // 1.6.5
		        // if req.url is valid vURL, connect to target vURL directly,
				// otherwise do CONNECT tunnel forwarrd over target vURL
				var dstip   = routing.dst.ipaddr;
                var dstport = routing.dst.port;
	                
		        if (req.url.match(vurle)) {
		            // 1.6.5.1
		            // connect it directly
		            if (Debug) console.log('turn-forward proxy, httpp connect to %s:%d', dstip, dstport);
							                
	                // connection options
	                var coptions = {
	                    port: dstport, 
	                    host: dstip, 
	                    
	                    // set user-specific feature,like maxim bandwidth,etc
	                    localAddress: {
	                        addr: routing.turn.lipaddr,
	                        port: routing.turn.agentport, 
	                        
	                        opt: {
	                            mbw: self.option.mbw || null
	                        }
	                    }
	                };
	                var srvSocket = UDT.connect(coptions, function() {
					    if (Debug) console.log('turn-forward, httpp got connected');
					
					    socket.write('HTTP/1.1 200 Connection Established\r\n' +
					                 'Proxy-agent: Node-Proxy\r\n' +
						             '\r\n');
						
						srvSocket.pipe(socket);
						socket.pipe(srvSocket);
	                });
					    
					srvSocket.on('error', function(e) {
					    console.log("turn-forward, httpp socket error: " + e);
					    socket.end();
					});						
		        } else {		        
			        // 1.6.5.2
			        // setup tunnel to target by make CONNECT request
				    var roptions = {
					        port: dstport,
					    hostname: dstip,
					      method: 'CONNECT',
					        path: req.url,
					       agent: false,
					        
	                    // set user-specific feature,like maxim bandwidth,etc
	                    // TBD... with user DB
	                    localAddress: {
	                        addr: routing.turn.lipaddr,
	                        port: routing.turn.agentport, 
	                        
	                         opt: {
	                            mbw: self.option.mbw || null
	                        }
	                    }
			        };
			        // set SSL related options
				    if (routing.secmode) {
				        roptions.rejectUnauthorized = true, 
	                    roptions.ca = self.sslcerts.ca.cont, 
	                    roptions.key = self.sslcerts.as.key,
	                    roptions.cert = self.sslcerts.as.cert
				    }			   
				    							
					var rreq = httpps.request(roptions);
					rreq.end();
					
					if (Debug) console.log('tunnel proxy, connect to %s:%d', dstip, dstport);
					rreq.on('connect', function(rres, rsocket, rhead) {
					    if (Debug) console.log('tunnel proxy, got connected');
					
					    socket.write('HTTP/1.1 200 Connection Established\r\n' +
					                 'Proxy-agent: Node-Proxy\r\n' +
						             '\r\n');
						
						rsocket.pipe(socket);
						socket.pipe(rsocket);
						
					    rsocket.on('error', function(e) {
					        console.log("tunnel proxy, socket error: " + e);
					        socket.end();
					    });
					});
					
					rreq.on('error', function(e) {
				        console.log("tunnel proxy, CONNECT request error: " + e);					        
				        socket.end();
				    });
			    }
		    });
		};		
		
        // 1.6.6
		// create CONNECT tunnel service	
		proxyServerHttpp.on('connect', proxyHttpTunnelService);
		proxyServerHttp.on('connect', proxyHttpTunnelService);
		
		// 1.7
		// Listening on proxy port for both HTTPP and HTTP server
		//  backlog 10K TBD...
		proxyServerHttpp.listen(self.turnPorts[0], self.ipaddr, function(){
		    console.log('httpp proxy-server listen on udp port '+self.turnPorts[0]);
		});
		proxyServerHttp.listen(self.turnPorts[0], self.ipaddr, function(){
		    console.log('http proxy-server listen on tcp port '+self.turnPorts[0]);
		});
        //////////////////////////////////////////////////////////////////////////////////////////////////
        
        // 1.8
        // record turn/proxy server
        self.turnSrvs.proxy = {host: self.ipaddr, port: self.turnPorts[0],
                                srv: {httpp: proxyServerHttpp, http: proxyServerHttp},
                               cert: self.sslcerts.ps
                              };

        // 2.
        // Agent websocket server
        // TBD... run in Domain
        var httppsrva;
        if (self.sslcerts.as)
        	httppsrva = httpps.createServer(self.sslcerts.as);
        else
        	httppsrva = httpp.createServer();
        
        
        var agentServer;
        // check on secure websocket
        if (self.naclcerts && self.naclcerts.as)
        	agentServer = new SecureWebSocketServer({
        	 httpp: true,
        	server: httppsrva,
        	  path: SEP.SEP_CTRLPATH_AS
        }, {
        		    version: 2,
        		       cert: self.naclcerts.as.cert,
        		         ca: self.naclcerts.ca.cert,
        		requireCert: false,

        		myPublicKey: Naclcert.ArrayToUint8(self.naclcerts.as.key.publickey),
        		mySecretKey: Naclcert.ArrayToUint8(self.naclcerts.as.key.secretkey)
        });
        else
        	agentServer = new WebSocketServer({
        	 httpp: true,
        	server: httppsrva,
        	  path: SEP.SEP_CTRLPATH_AS
        });

        self.turnSrvs.agent = {
        		    host: self.ipaddr, 
        		    port: self.turnPorts[1],
        		
        		     srv: agentServer, 
        		httppsrv: httppsrva,
        		
        		    path: SEP.SEP_CTRLPATH_AS,
        		
        		 sslcert: self.sslcerts.as,
        		naclcert: self.naclcerts.as
        };
                
        // agent logics
        // TBD...
        agentServer.on('connection', function(client){
            if (Debug) console.log('agent for client:');
            
            // onMessage handler
            client.on('message', function(message, flags){
             // !!! catch any exceptions and ignore it
             try {
            
                var tdata = (flags.binary) ? MSGPACK.decode(message) : JSON.parse(message);
                if (Debug) console.log('nmsrv:new turn agent message:'+JSON.stringify(tdata));
                
                // check if opc is valid
                if ('number' === typeof tdata.opc) {
                    switch (tdata.opc) {
                    // offer/answer opc /////////////////////////////////////////////
                    case SEP.SEP_OPC_PUNCH_OFFER:
                        // 1.
                        // check offer credit by user info
                        // notes: only support 51dese.com as domain at present !!!
                        if (tdata.offer.domain != '51dese.com' && tdata.offer.domain != 'www.51dese.com') {
                            console.log('invalid domain, please use 51dese.com by now');
                            
                            // fill punch hole answer
                            tdata.opc = SEP.SEP_OPC_PUNCH_ANSWER;
                            
                            tdata.answer = {};
                            tdata.answer.ready = false;
                            tdata.answer.error = 'invalid domain, please use 51dese.com by now';
                            
                            // 1.1
                            // send back punch hole answer message, then close agent socket
                            sendOpcMsg(client, tdata, function(err){
                                if (err) console.log(err+'sendOpcMsg failed');
                                
                                setTimeout(function(){
                                    if (client && client.close) client.close();
                                }, 2000); // 2s timeout
                            });
                            
                            // 1.1.1
                            // emit event
                            self.emit('AS.SEP.SEP_OPC_PUNCH_OFFER', {client: client, data: tdata});
                            
                            break;
                        }
                    
                        // 2.
                        // fill punch hole answer
                        tdata.opc = SEP.SEP_OPC_PUNCH_ANSWER;
                        
                        tdata.answer = {
                            state: SEP.SEP_OPC_STATE_READY,
                            ready: true
                        };
                        
                        // 3.
                        // record client connection info
                        client.clntinfo = {
                            // user info
                            domain: tdata.offer.domain,
                            usrkey: tdata.offer.usrkey,
                            
                            // client info      
                           clntgeoip: geoIP.lookup(client.remoteAddress), 
                              clntip: client.remoteAddress,
                            clntport: client.remotePort,
                               srvdn: self.dn,
                               srvip: self.ipaddr,
                             srvport: self.turnPorts[1]
                        };
                                   
                        // 4.
                        // persist turn punch session
                        var punch = new Turn.Punch({
                            // protocol info
                            proto: tdata.offer.proto,
                             mode: tdata.offer.mode,
                              sid: UUID.v4(),
                            
                            // user info
                            domain: tdata.offer.domain,
                            usrkey: tdata.offer.usrkey,
                            
                            // client info
                              clntpublicIP: client.remoteAddress,
                            clntpublicPort: client.remotePort,
                                 clntgeoip: JSON.stringify(client.clntinfo.clntgeoip),
                            
                                  clntgid: tdata.offer.clntgid,
                              clntlocalIP: tdata.offer.clntlocalIP,
                            clntlocalPort: tdata.offer.clntlocalPort,
                                   devkey: tdata.offer.devkey,
                                    vmode: tdata.offer.vmode,
                                  secmode: tdata.offer.secmode, 
                            
                            // server info
                             srvpublicDN: self.dn,
                             srvpublicIP: tdata.offer.srvip,
                            srvproxyPort: tdata.offer.proxyport,
                            srvagentPort: tdata.offer.agentport,
                            
                                   srvlocalIP: client.address().address,
                            srvlocalproxyPort: self.turnPorts[0],
                            srvlocalagentPort: self.turnPorts[1]
                        });
                        
                        punch.saveOupdate(function(err, punch){
                            if (err || !punch) {
                                console.log(err+',persist turn punch session failed');
                                tdata.answer.ready = false;
                                
                                // 6.
                                // send back punch hole answer message
                                sendOpcMsg(client, tdata);
                                
                                // 6.1
                                // emit event
                                self.emit('AS.SEP.SEP_OPC_PUNCH_OFFER', {client: client, data: tdata});
                            } else {    
                                // 4.1
                                // record client gid
                                client.clntinfo.gid = punch.client.gid;
                                                     
                                // 5.
                                // setup TURN routing entry via vURL
                                // !!! /vurl/:clntgid is default vURL rootpath to name-client
                                
                                // 5.1
                                // check name-client vURL mode: 'vpath' or 'vhost'
                                var vurle = (tdata.offer.vmode === vurl.URL_MODE_PATH) ? punch.client.vpath : punch.client.vhost;
                                var shash = SIPHASH.hash(SIPKEY, vurle+tdata.offer.domain+tdata.offer.usrkey);
                                   
                                vURL.put(
                                    // vURL routing entry: vurl,turn server info, destination address info
                                    {
                                        // set live flag as true
                                        live: true,
                                        
                                        // vURL identifier to destintion name-client
                                        mode: tdata.offer.vmode,
                                        vurl: vurle,
                                        
                                        // secure mode,generate seckeys
                                        // notes: vtoken = SIPHASH.hash_hex(seckeys, vurle)
                                        secmode: tdata.offer.secmode,
                                        seckeys: [shash.h, shash.l, shash.h ^ shash.l, shash.h],
                                        
                                        // TURN/PROXY server info
                                        turn: {
                                                   dn: self.dn,
                                               ipaddr: tdata.offer.srvip,
                                            proxyport: tdata.offer.proxyport,
                                            agentport: tdata.offer.agentport, // equal to client.address().port
                                            
                                            // TURN server local ip address
                                              lipaddr: client.address().address
                                        },
                                        
                                        // destination name-client info
                                        dst: {
                                              geoip: {country: client.clntinfo.clntgeoip.country, city: client.clntinfo.clntgeoip.city},
                                             ipaddr: client.remoteAddress, 
                                               port: client.remotePort,
                                          
                                            lipaddr: tdata.offer.clntlocalIP,
                                              lport: tdata.offer.clntlocalPort,
                                                gid: tdata.offer.clntgid
                                        },      
                                        
                                        // destination user info
				                        usrinfo: {
				                            domain: tdata.offer.domain,
				                            usrkey: tdata.offer.usrkey
				                        }
                                    },
                                    function(err, routing){
	                                    if (err || !routing) {
	                                        console.log(err+',setup TURN vURL routing entry failed');
	                                        tdata.answer.ready = false;
	                                
	                                        // 6.
	                                        // send back punch hole answer message
	                                        sendOpcMsg(client, tdata);
	                                        
	                                        // 6.1
	                                        // emit event
                                            self.emit('AS.SEP.SEP_OPC_PUNCH_OFFER', {client: client, data: tdata});
	                                    } else {
	                                        console.log(err+',setup TURN vURL routing entry successfully:'+JSON.stringify(routing));
	                                        
	                                        tdata.answer.ready = true;
	                                        
	                                        // pass vURL security token
	                                        if (tdata.offer.secmode > SEP.SEP_SEC_SSL) 
	                                            tdata.answer.vtoken = SIPHASH.hash_hex(routing.seckeys, routing.vurl);
	                                        else 
	                                            tdata.answer.vtoken = '';
	                                        
	                                        // 6.
	                                        // send back punch hole answer message
	                                        sendOpcMsg(client, tdata);
	                                        
	                                        // 6.1
	                                        // emit event
                                            self.emit('AS.SEP.SEP_OPC_PUNCH_OFFER', {client: client, data: tdata});
	                                        
	                                        // 7.	                                        
                                            // store client in cache with vurl
                                            client.clntinfo.vurl = vurle;
                                            
                                            var ck = client.clntinfo.vurl; // vurl as key to name-client
                                            var sk = 'agent';              // key for agent server ip/port
                                            
                                            self.turnConn[sk]       = self.turnConn[sk] || {};
                                            (self.turnConn[sk])[ck] = client;
	                                    }
                                });
                            }
                        });
                        
                        break;
                    
                    default:
                        console.log('unknown opc');
                        break;
                    }
                } else {
                    console.log('unknown message, nothing to do');    
                }
                
             } catch (e) {
                 console.error('Turn agent-server ignore caught message-handle exception '+e);
             }
             
            });
            
            // onClose handler
            client.on('close', function(){
                if (Debug) console.log('client.onClose:'+JSON.stringify(client.clntinfo));
                if (client.clntinfo) {
                    // emit event
                    self.emit('AS.client.close', {clntinfo: client.clntinfo});
                
                    // clear client connection cache
                    var ck = client.clntinfo.vurl; // vurl as key to name-client
                    var sk = 'agent';              // key for agent server ip/port
                    if (Debug) console.log('ck:'+ck+',sk:'+sk+',self.turnConn[sk][ck]:'+(self.turnConn[sk])[ck]);
                    if (self.turnConn[sk] && (self.turnConn[sk])[ck]) {                    
                        (self.turnConn[sk])[ck] = null;
                    }
                    
                    // clear TURN server vURL entry
                    vURL.del(client.clntinfo.vurl);
                    
                    // clear Peer-Service entry
                    peerService.clrByvURL(client.clntinfo.vurl);
                        
                    // clear TURN server turnProxyCache
                    if (client.clntinfo.vurl in self.turnProxyCache) {
                        if (Debug) console.log('clear turnProxyCache on vurl:'+client.clntinfo.vurl);
                        self.turnProxyCache[client.clntinfo.vurl] = null;
                    }
                    
                    // clear TURN server trunProxyHistory
                    Object.keys(self.trunProxyHistory).forEach(function(key){
                        if (key.match(client.clntinfo.vurl)) {
                            if (Debug) console.log('clear trunProxyHistory on '+key);
                            self.trunProxyHistory[key] = null;
                        }
                    });
                        
                    // clear client info
                    client.clntinfo = null;   
                }
            });
        });

        // agent server
        // backlog 10K TBD...
        httppsrva.listen(self.turnPorts[1], self.ipaddr);                       
        console.log('agent-server listen on udp port '+self.turnPorts[1]);
    }
};

util.inherits(nmSrv, eventEmitter);

// exprots SEP 
exports.SEP = SEP;

// exports iWebPP name-client
exports.Client = iWebPP;

// exports Version
exports.Version = 2;

