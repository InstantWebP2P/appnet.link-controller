// Copyright (c) 2012-present Tom Zhou<iwebpp@gmail.com>
//
// Session Description protocol model:
// 1. when user login to nameserver, nameserver record user's connection info, session 
//    id and user identify, etc;
// 2. when user want to connect to peer, nameserver decide how to punch hole and setup
//    p2p connection;
// 3. when user logout, nameserver update user's session to offline, and notify peers;
// 4. when user relogin, nameserver update user's session with new connection info and
//    notify peers;
// 5. nameserver basically maintain a live connection state-machine and cooperate with peers;
// 6. to punch hole easily, the client as user always binds one same ip/port on the device
// 7. for details, please refer to iWebPP_SW_Func_Spec.doc and Roadisys_Virtual_URL_SW_Func_Spec.doc
// ...

'use strict';
var debug        = require('debug')('sdp');

var eventEmitter = require('events').EventEmitter,
    util         = require('util');

var SdpDB        = require('./db/sdp');

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

// generate gid for SDP
var genUsrid = function(usrinfo){
    return genHuid('usr-'+usrinfo.usrkey+'-'+usrinfo.domain);
};

var genClntid = function(clntinfo){
    return genHuid(clntinfo.proto+'-clnt-'+clntinfo.devkey+'-'+clntinfo.clntlocalIP+'-'+clntinfo.clntlocalPort);
};

var genSrvid = function(srvinfo){
    return genHuid(srvinfo.proto+'-srv-'+srvinfo.srvpublicIP+'-'+srvinfo.srvpublicPort);
};

// gid stands for nodeGID
var Sdp = module.exports = function(session){
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
    // session id globally unique between nameserver and client
    // notes: actually sid = nameserver info + session id within this nameserver
    // for example, nameserver IP:port + sid
    self.sessionInfo = {
          sid: session.sid,
        proto: session.proto, // session's protocol: tcp/udp/sctp/rtp/rtcp, etc
        
        // set live flag as true
        live: 1,
                
        // client's outer and publick network address
        // notes: public ip/port respects NAT info
          clntid: session.clntgid,
          clntIP: session.clntpublicIP,
        clntPort: session.clntpublicPort,

        // routerpath info from nameserver to client direction
        // notes: routerpath info used to setup efficient p2p session traverse,
        // that every element in array is a pair of (from, to) struct
        routerpath: session.routerpath || '',
        
        // timestamp
        start: session.start || Date.now()
    };

    // Server info
    // nameserver's public network address
    // notes: 
    // 1. to detect client firewall type, client will bind at the same udp port
    //    and connect to two nameserver port at same time;
    // 2. if client's two public IP/Port are same, then client is in non-symetric firewall
    // 3. otherwise, client is behind symetric firewall
    // 4. if both peer are behind symetric firewall, we need to TURN server to setup p2p connection
    self.srvInfo = {
           dn: session.srvpublicDN,       // domain name
           ip: session.srvpublicIP,       // outter/public ip
         port: session.srvpublicPort,     // outter/public port. even port: 51868, odd port: 51869
          gid: genSrvid(session),         // Gid
         
          localIP: session.srvlocalIP,  // inner/local ip or interface
        localPort: session.srvlocalPort // inner/local port
    };
    
    // Client info
    // notes: a client defined as a device with local proto/ip/port
    self.clntInfo = {
        // set live flag as true
        live: 1,
        
        // client's Geo info, like below:
        // {range: [ 3479299040, 3479299071 ], country: 'US', region: 'CA', city: 'San Francisco', ll: [37.7484, -122.4156] }
        geoip: session.clntgeoip,

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

        // TURN agent session state: true - ready, false - not ready
        turnagentReady: session.turnagentReady || false,
        
        // client gid
        gid: session.clntgid,
        
        // client vURL vpath or vhost
        // TBD... allocation schema
         vpath: '/vurl/'+clntgidhex, // '/vurl/gid' in default by now
         vhost: clntgidhex+'.vurl.', // 'gid.vurl.51dese.com' like append on 51dese.com
         vmode: session.vmode,    // vURL mode
        vtoken: session.vtoken,   // vURL secure token, it't querystring by now like ?vtoken=xxx
        
        // client security mode level-based. default level is 1
        // - 0: disable https/wss
        // - 1: enable https/wss, 
        //      allow turn-agent connection,
        //      allow host-only-based-token authentication with stun session
        // - 2: enable https/wss,
        //      allow turn-agent connection,
        //      allow host-port-based-token authentication with stun session
        secmode: session.secmode
    };
    
    // User info
    self.usrInfo = {
        // application specific identify for user
        // notes: appkey used to identify a user on a live connection
        // nameserver support multiple user login, that means a user
        // can login from the different device at same time.
        // !!! in a device, user can be only login uniquely.
        // !!! devkey+(local IP/Port) can identify a client for user,
        // !!! devkey+(local IP/Port)+(nameserver IP/Port) can identify one SDP record;
        // !!! (public IP/Port) can identify a client for user as well, ???
        // !!! (public IP/Port)+(nameserver IP/Port) can identify one SDP record as well. ???
        domain: session.domain,
        usrkey: session.usrkey,
           gid: genUsrid(session),

        // application info, optional
        appkey: session.appkey || '', // app route path get/post ..., optional
        grpkey: session.grpkey || ''  // user group info, optional
    };
    
};

util.inherits(Sdp, eventEmitter);

// db hook
Sdp.db = SdpDB;

// instance method
Sdp.prototype.saveOupdate = function(fn){
    var self = this;
    
    // 1.
    // update user-node
    SdpDB.updateUser(self.usrInfo.gid, self.usrInfo, function(err, node){
        if (err || !node) return fn(err+',update user node failure');
        var user = node;
        
        // 2.
        // update client-node
        SdpDB.updateClient(self.clntInfo.gid, self.clntInfo, function(err, node){
            if (err || !node) return fn(err+',update client node failure');
            var client = node;
            
            // 3.
            // update nameserver-node
            SdpDB.updateNmsrv(self.srvInfo.gid, self.srvInfo, function(err, node){
                if (err || !node) return fn(err+',update name server node failure');
                var server = node;

                // 4.
                // update the session between user and client
                // notes: sessionInfo is like {type: xxx, data: {xxx}}
                var sessinfo = {type: SdpDB.SESSION_LOGIN, data: {start: self.sessionInfo.start}};
                SdpDB.updateSession(user, client, sessinfo, function(err, session){
                    if (err || !session) return fn(err+',update login session failure');
                    var login = session;
                    
                    // 5.
                    // update the session between client and server
                    sessinfo = {type: SdpDB.SESSION_SDP, data: self.sessionInfo};
                    SdpDB.updateSession(client, server, sessinfo, function(err, session){
                        if (err || !session) return fn(err+',update sdp session failure');
                        var sdp = session;
                        
                        // 6.
                        // update the route session between client and server, in case tracerouter available
                        // TBD...

                        // 7.
                        // emit update event
                        self.emit('update', {user: user, client: client, server: server, login: login, sdp: sdp});
                        
                        // 8.
                        // pass SDP back
                        fn(null, {user: user, client: client, server: server, login: login, sdp: sdp});
                        
                        ///console.log('update SDP session:'+JSON.stringify({user: user, client: client, server: server, login: login, sdp: sdp}));
                    });
                });
            });
        });
    });
};

// class method

// get login session
Sdp.getLoginByUsr = function(usrid, fn){
    SdpDB.getSessionByFromType({gid: usrid}, {type: SdpDB.SESSION_LOGIN}, fn);
};

Sdp.getAllLogin = function(fn){
    SdpDB.getSessionsByType({type: SdpDB.SESSION_LOGIN}, fn);
};

// get sdp session
Sdp.getSdpByClnt = function(clntid, fn){
    SdpDB.getSessionByFromType({gid: clntid}, {type: SdpDB.SESSION_SDP}, fn);
};

Sdp.getAllSdp = function(fn){
    SdpDB.getSessionsByType({type: SdpDB.SESSION_SDP}, fn);
};

// update sdp session
Sdp.updateSdpByClnt = function(clntid, sesninfo, fn){
    sesninfo.type = SdpDB.SESSION_SDP;
    SdpDB.updateSessionsByFromType({gid: clntid}, sesninfo, fn);
};

// get user info
Sdp.getAllUsrs = function(fn){
    SdpDB.getUsers(fn);
};

// update client info, used to update NAT type normally
Sdp.updateClntInfo = function(clntinfo, fn){
    SdpDB.updateClient(clntinfo.gid, clntinfo, function(err, node){
        if (err || !node) return fn(err+',update client info failed');
        fn(null, node);
    });   
};

// test user existence
Sdp.testUser = function(usrinfo, fn){
    SdpDB.testNodeById(genUsrid(usrinfo), fn);
};

// export gid generator
Sdp.genUsrid  = genUsrid;
Sdp.genClntid = genClntid;
Sdp.genSrvid  = genSrvid;

