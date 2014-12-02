// Copyright (c) 2012-2013 Tom Zhou<zs68j2ee@gmail.com>
//
// TURN establish the session between two clients by relay server
// 0. relay server consists of three services: proxy server, agent server(used to punch hole) and agent client, that binds on same ip and different port
// - 0.1 proxy server accept connect from initiator client, then proxy request/response to responder client for agent client
// - 0.2 agent server accept connect from responder client, which used to punch hole from responder client to agent client
// - 0.3 proxy server binds on proxy port, while agent server/client binds on agent port
// 
// 1. one client acts as initiator, another client acts as responder and relay server as meddle server
// 2. TURN has two mode: TURN_CS, TURN_PP, that matched to STUN_CS, STUN_PP
// 3. TURN_CS means the connection setup in client to server mode
// 4. TURN_PP means the connection setup in rendezvous mode 
// 5. TURN does need relay-server
// 
// 6. TURN has three logical connections:
// - 6.1 responder client connect to relay-server's agent server, which used to punch hole to responder client for agent client
// - 6.2 initiator client connect to relay-server proxy server
// - 6.3 relay-server agent client connect to responder client

var eventEmitter = require('events').EventEmitter,
    util = require('util');

var SdpDB = require('./db/sdp');

// security hash
// sipkey can be any user defined 4 integers, 3 sipkey generate 192bits secure number
var siphash = require('siphash'),
    sipkey1 = [0x33331111, 0x66668888, 0x55556666, 0x33338888], // magic key1
    sipkey2 = [0x38385886, 0x86866969, 0x56556686, 0x36839816]; // magic key2

// generate 128bits hashed uid
var genHuid = function(uuid){
    var s1, s2;
    
    s1 = siphash.hash_hex(sipkey1, uuid);
    s2 = siphash.hash_hex(sipkey2, uuid+'-'+s1);
    
    return s1+s2;
};

// generate gid for turn server
var genSrvid = function(srvinfo){
    return genHuid(srvinfo.proto+'-srv-'+srvinfo.srvpublicIP+'-'+srvinfo.srvproxyPort+'-'+srvinfo.srvagentPort);
};

var genClntid = function(clntinfo){
    return genHuid(clntinfo.proto+'-clnt-'+clntinfo.devkey+'-'+clntinfo.clntlocalIP+'-'+clntinfo.clntlocalPort);
};

var Turn = module.exports = function(session){
    var self = this;
        
    // super constructor
    eventEmitter.call(self);
    
    // Session info
    self.sessionInfo = {
        // protocol info
        sid: session.sid,
        
        proto: session.proto, // session's protocol: tcp/udp/sctp/rtp/rtcp, etc
         mode: session.mode,  // p2p or c/s        
            
        // initiator client's outer and public network address
            mineid: session.mineid,
        minenatype: session.minenatype,
            mineIP: session.mineIP,
          minePort: session.minePort, // meaningless in symmetric NAT/FW
        
        // relay proxy/agent server outer and public network address
            srvid: genSrvid(session),
            srvDN: session.srvpublicDN,       // domain name
            srvIP: session.srvpublicIP,
        proxyPort: session.srvproxyPort,
        agentPort: session.srvagentPort,
            
        // responder client's outer and public network address
            peerid: session.peerid,
        peernatype: session.peernatype,
            peerIP: session.peerIP,
          peerPort: session.peerPort, // meaningless in symmetric NAT/FW
                
        // media,sensor parameters. video resolution/fps/bps, sensor resolution/sps, etc
        // notes: parameters MUST be negotiated between peers
        parameter: session.parameter || '',
          
        // timestamp
        start: session.start || Date.now()
    };
    
    // Clients info
    // notes: store client's gid, NAT type, etc
    // NAT type: symmetric, asymmetric, etc
    self.clntsInfo = {
        mine: {gid: session.mineid, natype: session.minenatype},
        peer: {gid: session.peerid, natype: session.peernatype}
    };
    
    // Relay server info
    self.srvInfo = {
                    dn: session.srvpublicDN,       // domain name
                    ip: session.srvpublicIP,       // outter/public ip
             proxyport: session.srvproxyPort,      // outter/public proxy port
             agentport: session.srvagentPort,      // outter/public agent port
                   gid: genSrvid(session),         // Gid
         
               localIP: session.srvlocalIP,        // inner/local ip or interface
        localproxyPort: session.srvlocalproxyPort, // inner/local proxy port
        localagentPort: session.srvlocalagentPort  // inner/local agent port
    };
    
};

util.inherits(Turn, eventEmitter);

// db hook
Turn.db = SdpDB;

// instance methods
Turn.prototype.saveOupdate = function(fn){
    var self = this;
    
    // 1.
    // query mine as client-node
    SdpDB.getClient(self.clntsInfo.mine.gid, function(err, node){
        if (err || !node) return fn(err+'query mine client node failure');
        var mine = node;
        
        // 2.
        // update relay server-node
        SdpDB.updateRelaysrv(self.srvInfo.gid, self.srvInfo, function(err, node){
            if (err || !node) return fn(err+',update relay server node failure');
            var server = node;
        
            // 3.
            // query peer as client-node
            SdpDB.getClient(self.clntsInfo.peer.gid, function(err, node){
                if (err || !node) return fn(err+'query peer client node failure');
                var peer = node;
            
                // 4.
                // update turn session from mine to peer client
                var sessinfo = {type: SdpDB.SESSION_TURN, data: self.sessionInfo};
                SdpDB.updateSession(mine, peer, sessinfo, function(err, session){
                    if (err || !session) return fn(err+'update turn session failure');
                    var turn = session;               
                     
                    // 5. TBD...in case p2p session
                    // update turn proxy session from mine to relay proxy server
                    ///sessinfo = {
                    ///    type: SdpDB.SESSION_TURN_PROXY, 
                    ///    data: self.sessionInfo
                    ///};
                    ///SdpDB.updateSession(mine, server, sessinfo, function(err, session){
                    ///    if (err || !session) return fn(err+'update turn proxy session failure');
                    ///    var proxy = session;     
                        
                        // 6. TBD...in case p2p session
                        // update turn agent session from relay agent server to peer client
                        ///sessinfo = {
                        ///    type: SdpDB.SESSION_TURN_AGENT, 
                        ///    data: self.sessionInfo
                        ///};
                        ///SdpDB.updateSession(server, peer, sessinfo, function(err, session){
                        ///    if (err || !session) return fn(err+'update turn agent session failure');
                        ///    var agent = session;   
                                    
                            // 7.
                            // emit update event
                            self.emit('update', {mine: mine, peer: peer, server: server, session: turn});
                            
                            // 8.
                            // ...
                
                            // 9.
                            // pass TURN back
                            fn(null, {mine: mine, peer: peer, server: server, session: turn});
                        ///});
                    ///});
                });
            });
        });
    });
};

// class methods

// get turn session
exports.getTurnByClntFrom = function(clntid, fn){
    SdpDB.getSessionByFromType({gid: clntid}, {type: SdpDB.SESSION_TURN}, fn);
};

exports.getTurnByClntTo = function(clntid, fn){
    SdpDB.getSessionByToType({gid: clntid}, {type: SdpDB.SESSION_TURN}, fn);
};

exports.getAllTurn = function(fn){
    SdpDB.getSessionsByType({type: SdpDB.SESSION_TURN}, fn);
};

// export gid generator
Turn.genSrvid  = genSrvid;
Turn.genClntid = genClntid;

// turn Punch session: client to agent server
var turnPunch = function(session){
    var self = this;
    var clntgidhex = '';

    // super constructor
    eventEmitter.call(self);
    
    // calculate clntgid in case anonymous client
    if (session.clntgid) {
        clntgidhex = genHuid(session.clntgid);
    } else {
        clntgidhex = session.clntgid = genClntid(session);
    }
    
    // Session info
    self.sessionInfo = {
        sid: session.sid,
        
        proto: session.proto, // session's protocol: tcp/udp/sctp/rtp/rtcp, etc
         mode: session.mode,  // p2p or c/s
                    
        // client's outer and public network address
          clntid: session.clntgid,
          clntIP: session.clntpublicIP,
        clntPort: session.clntpublicPort,
           
        // relay proxy/agent server outer and public network address
            srvid: genSrvid(session),
            srvDN: session.srvpublicDN,       // domain name
            srvIP: session.srvpublicIP,
        proxyPort: session.srvproxyPort,
        agentPort: session.srvagentPort,
        
        // media,sensor parameters. video resolution/fps/bps, sensor resolution/sps, etc
        // notes: parameters MUST be negotiated between peers
        parameter: session.parameter || '',
          
        // timestamp
        start: session.start || Date.now()
    };
    
    // Client info
    // notes: a client defined as a device with local proto/ip/port
    self.clntInfo = {
        // client's inner and local network address
        // notes: user always binds on one ip/port in device to punch hole easily
          localIP: session.clntlocalIP,
        localPort: session.clntlocalPort,
        
        // client's device info
        devkey: session.devkey,       // client device's serial number info: phone, pc, tablet, etc
        devcap: session.devcap || '', // client sevice's capabilities: video/audio/stroage medias, sensors/ecg, etc
        
        // NAT type behind client
        // notes: assume asymmetric in default :)
        // !!! NAT type can be determined in client side
        ///natype: session.natype || SdpDB.NAT_ASYM, // symmetric, asymmetric, etc

        // client gid
        gid: session.clntgid,
        
        // client vURL vpath or vhost
        // TBD... allocation schema
         vpath: '/vurl/'+clntgidhex, // '/vurl/gid' in default by now
         vhost: clntgidhex+'.vurl.', // 'gid.vurl.iwebpp.com' like append on iwebpp.com
         vmode: session.vmode,    // vURL mode
        vtoken: session.vtoken,   // vURL secure token
        
        // client security mode level-based
        secmode: session.secmode
    };
    
    // Relay server info
    self.srvInfo = {
                    dn: session.srvpublicDN,       // domain name
                    ip: session.srvpublicIP,       // outter/public ip
             proxyport: session.srvproxyPort,      // outter/public proxy port
             agentport: session.srvagentPort,      // outter/public agent port
                   gid: genSrvid(session),         // Gid
         
               localIP: session.srvlocalIP,        // inner/local ip or interface
        localproxyPort: session.srvlocalproxyPort, // inner/local proxy port
        localagentPort: session.srvlocalagentPort  // inner/local agent port
    };
    
};

util.inherits(turnPunch, eventEmitter);

// instance methods
turnPunch.prototype.saveOupdate = function(fn){
    var self = this;
    
    
    // 1.
    // update client-node
    SdpDB.updateClient(self.clntInfo.gid, self.clntInfo, function(err, node){
        if (err || !node) return fn(err+'update client node failure');
        var client = node;
        
        // 2.
        // update relay server-node
        SdpDB.updateRelaysrv(self.srvInfo.gid, self.srvInfo, function(err, node){
            if (err || !node) return fn(err+',update relay server node failure');
            var server = node;
            
            // 3.
            // update turn punch session from client to relay agent server
            var sessinfo = {
                type: SdpDB.SESSION_TURN_PUNCH, 
                data: self.sessionInfo
            };
            SdpDB.updateSession(client, server, sessinfo, function(err, session){
                if (err || !session) return fn(err+'update turn punch session failure');                       
                // 4.
                // emit update event
                self.emit('update', {client: client, server: server, session: session});
                
                // 5.
                // ...
    
                // 6.
                // pass TURN punch session back
                fn(null, {client: client, server: server, session: session});
            });
        });
    });
};

// class methods

// get turn punch session
exports.getTurnPunchByClnt = function(clntid, fn){
    SdpDB.getSessionByFromType({gid: clntid}, {type: SdpDB.SESSION_TURN_PUNCH}, fn);
};

exports.getTurnPunchBySrv = function(srvid, fn){
    SdpDB.getSessionByToType({gid: srvid}, {type: SdpDB.SESSION_TURN_PUNCH}, fn);
};

exports.getAllTurnPunch = function(fn){
    SdpDB.getSessionsByType({type: SdpDB.SESSION_TURN_PUNCH}, fn);
};

Turn.Punch = turnPunch;

// turn Proxy session: client to proxy server
var turnProxy = function(session){
    var self = this;
    var clntgidhex = '';

    // super constructor
    eventEmitter.call(self);
    
    // calculate clntgid in case anonymous client
    if (session.clntgid) {
        clntgidhex = genHuid(session.clntgid);
    } else {
        clntgidhex = session.clntgid = genClntid(session);
    }
    
    // Session info
    self.sessionInfo = {
        // protocol info
        sid: session.sid,
        
        proto: session.proto, // session's protocol: tcp/udp/sctp/rtp/rtcp, etc
         mode: session.mode,  // p2p or c/s
               
        // client's outer and public network address
          clntid: session.clntgid,
          clntIP: session.clntpublicIP,
        clntPort: session.clntpublicPort,
            
        // relay proxy/agent server outer and public network address
            srvid: genSrvid(session),
            srvDN: session.srvpublicDN,       // domain name
            srvIP: session.srvpublicIP,
        proxyPort: session.srvproxyPort,
        agentPort: session.srvagentPort,
        
        // media,sensor parameters. video resolution/fps/bps, sensor resolution/sps, etc
        // notes: parameters MUST be negotiated between peers
        parameter: session.parameter || '',
          
        // timestamp
        start: session.start || Date.now()
    };
    
    // Client info
    // notes: a client defined as a device with local proto/ip/port
    self.clntInfo = {
        // client's inner and local network address
        // notes: user always binds on one ip/port in device to punch hole easily
          localIP: session.clntlocalIP,
        localPort: session.clntlocalPort,
        
        // client's device info
        devkey: session.devkey,       // client device's serial number info: phone, pc, tablet, etc
        devcap: session.devcap || '', // client sevice's capabilities: video/audio/stroage medias, sensors/ecg, etc
        
        // NAT type behind client
        // notes: assume asymmetric in default :)
        // !!! NAT type can be determined in client side
        ///natype: session.devnat || SdpDB.NAT_ASYM, // symmetric, asymmetric, etc

        // client gid
        gid: session.clntgid,
        
        // client vURL vpath or vhost
        // TBD... allocation schema
         vpath: '/vurl/'+clntgidhex, // '/vurl/gid' in default by now
         vhost: clntgidhex+'.vurl.', // 'gid.vurl.iwebpp.com' like append on iwebpp.com
         vmode: session.vmode,    // vURL mode
        vtoken: session.vtoken,   // vURL secure token
        
        // client security mode level-based
        secmode: session.secmode
    };
    
    // Relay server info
    self.srvInfo = {
                    dn: session.srvpublicDN,       // domain name
                    ip: session.srvpublicIP,       // outter/public ip
             proxyport: session.srvproxyPort,      // outter/public proxy port
             agentport: session.srvagentPort,      // outter/public agent port
                   gid: genSrvid(session),         // Gid
         
               localIP: session.srvlocalIP,        // inner/local ip or interface
        localproxyPort: session.srvlocalproxyPort, // inner/local proxy port
        localagentPort: session.srvlocalagentPort  // inner/local agent port
    };
    
};

util.inherits(turnProxy, eventEmitter);

// instance methods
turnProxy.prototype.saveOupdate = function(fn){
    var self = this;
    
    
    // 1.
    // update client-node
    SdpDB.updateClient(self.clntInfo.gid, self.clntInfo, function(err, node){
        if (err || !node) return fn(err+'update client node failure');
        var client = node;
        
        // 2.
        // update relay server-node
        SdpDB.updateRelaysrv(self.srvInfo.gid, self.srvInfo, function(err, node){
            if (err || !node) return fn(err+',update relay server node failure');
            var server = node;
            
            // 3.
            // update turn proxy session from client to relay proxy server
            var sessinfo = {
                type: SdpDB.SESSION_TURN_PROXY, 
                data: self.sessionInfo
            };
            SdpDB.updateSession(client, server, sessinfo, function(err, session){
                if (err || !session) return fn(err+'update turn proxy session failure');                        
                // 4.
                // emit update event
                self.emit('update', {client: client, server: server, session: session});
                
                // 5.
                // ...
    
                // 6.
                // pass TURN proxy session back
                fn(null, {client: client, server: server, session: session});
            });
        });
    });
};

// class methods

// get turn proxy session
exports.getTurnProxyByClnt = function(clntid, fn){
    SdpDB.getSessionByFromType({gid: clntid}, {type: SdpDB.SESSION_TURN_PROXY}, fn);
};

exports.getTurnProxyBySrv = function(srvid, fn){
    SdpDB.getSessionByToType({gid: srvid}, {type: SdpDB.SESSION_TURN_PROXY}, fn);
};

exports.getAllTurnProxy = function(fn){
    SdpDB.getSessionsByType({type: SdpDB.SESSION_TURN_PROXY}, fn);
};

Turn.Proxy = turnProxy;

// turn Agent session: agent server to client
var turnAgent = function(session){
    var self = this;
    var clntgidhex = '';

    // super constructor
    eventEmitter.call(self);
    
    // calculate clntgid in case anonymous client
    if (session.clntgid) {
        clntgidhex = genHuid(session.clntgid);
    } else {
        clntgidhex = session.clntgid = genClntid(session);
    }
    
    // Session info
    self.sessionInfo = {
        sid: session.sid,
        
        proto: session.proto, // session's protocol: tcp/udp/sctp/rtp/rtcp, etc
         mode: session.mode,  // p2p or c/s
             
        // client's outer and public network address
          clntid: session.clntgid,
          clntIP: session.clntpublicIP,
        clntPort: session.clntpublicPort,
           
        // relay proxy/agent server outer and public network address
            srvid: genSrvid(session),
            srvDN: session.srvpublicDN,       // domain name
            srvIP: session.srvpublicIP,
        proxyPort: session.srvproxyPort,
        agentPort: session.srvagentPort,
        
        // media,sensor parameters. video resolution/fps/bps, sensor resolution/sps, etc
        // notes: parameters MUST be negotiated between peers
        parameter: session.parameter || '',
          
        // timestamp
        start: session.start || Date.now()
    };
    
    // Client info
    // notes: a client defined as a device with local proto/ip/port
    self.clntInfo = {
        // client's inner and local network address
        // notes: user always binds on one ip/port in device to punch hole easily
          localIP: session.clntlocalIP,
        localPort: session.clntlocalPort,
        
        // client's device info
        devkey: session.devkey,       // client device's serial number info: phone, pc, tablet, etc
        devcap: session.devcap || '', // client sevice's capabilities: video/audio/stroage medias, sensors/ecg, etc
        
        // NAT type behind client
        // notes: assume asymmetric in default :)
        // !!! NAT type can be determined in client side
        ///natype: session.natype || SdpDB.NAT_ASYM, // symmetric, asymmetric, etc

        // client gid
        gid: session.clntgid,
        
        // client vURL vpath or vhost
        // TBD... allocation schema
         vpath: '/vurl/'+clntgidhex, // '/vurl/gid' in default by now
         vhost: clntgidhex+'.vurl.', // 'gid.vurl.iwebpp.com' like append on iwebpp.com
         vmode: session.vmode,    // vURL mode
        vtoken: session.vtoken,   // vURL secure token
        
        // client security mode level-based
        secmode: session.secmode
    };
    
    // Relay server info
    self.srvInfo = {
                    dn: session.srvpublicDN,       // domain name
                    ip: session.srvpublicIP,       // outter/public ip
             proxyport: session.srvproxyPort,      // outter/public proxy port
             agentport: session.srvagentPort,      // outter/public agent port
                   gid: genSrvid(session),         // Gid
         
               localIP: session.srvlocalIP,        // inner/local ip or interface
        localproxyPort: session.srvlocalproxyPort, // inner/local proxy port
        localagentPort: session.srvlocalagentPort  // inner/local agent port
    };
    
};

util.inherits(turnAgent, eventEmitter);

// instance methods
turnAgent.prototype.saveOupdate = function(fn){
    var self = this;
    
    
    // 1.
    // update client-node
    SdpDB.updateClient(self.clntInfo.gid, self.clntInfo, function(err, node){
        if (err || !node) return fn(err+'update client node failure');
        var client = node;
        
        // 2.
        // update relay server-node
        SdpDB.updateRelaysrv(self.srvInfo.gid, self.srvInfo, function(err, node){
            if (err || !node) return fn(err+',update relay server node failure');
            var server = node;
            
            // 3.
            // update turn agent session from relay agent server to client
            var sessinfo = {
                type: SdpDB.SESSION_TURN_AGENT, 
                data: self.sessionInfo
            };
            SdpDB.updateSession(server, client, sessinfo, function(err, session){
                if (err || !session) return fn(err+'update turn agent session failure'); 
                                    
                // 4.
                // emit update event
                self.emit('update', {client: client, server: server, session: session});
                
                // 5.
                // ...
    
                // 6.
                // pass TURN agent session back
                fn(null, {client: client, server: server, session: session});
            });
        });
    });
};

// class methods

// get turn agent session
exports.getTurnAgentByClnt = function(clntid, fn){
    SdpDB.getSessionByToType({gid: clntid}, {type: SdpDB.SESSION_TURN_AGENT}, fn);
};

exports.getTurnAgentBySrv = function(srvid, fn){
    SdpDB.getSessionByFromType({gid: srvid}, {type: SdpDB.SESSION_TURN_AGENT}, fn);
};

exports.getAllTurnAgent = function(fn){
    SdpDB.getSessionsByType({type: SdpDB.SESSION_TURN_AGENT}, fn);
};

Turn.Agent = turnAgent;

