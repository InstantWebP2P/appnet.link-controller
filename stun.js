// Copyright (c) 2012-present Tom Zhou<iwebpp@gmail.com>
//
// STUN establish the session between two clients by UDP hole punch
// 1. One client acts as Initiator, another client acts as Responder
// 2. STUN has two mode: STUN_CS, STUN_PP
// 3. STUN_CS means the connection setup in client to server mode
// 4. STUN_PP means the connection setup in rendezvous mode 
// 5. STUN don't need relay-server. right now, Neither clients can behind Symmetric NAT/Firewall

var eventEmitter = require('events').EventEmitter,
    util = require('util');

var SdpDB = require('./db/sdp');


var Stun = module.exports = function(session){
    var self = this;
    
    // super constructor
    eventEmitter.call(self);
    
    // Session info
    self.sessionInfo = {
          sid: session.sid,
        proto: session.proto, // session's protocol: tcp/udp/sctp/rtp/rtcp, etc
         mode: session.mode,  // p2p or c/s
        
        // client's outer and public network address
        // notes: public ip/port respects NAT info
          mineid: session.mineid,
          mineIP: session.mineIP,
        minePort: session.minePort,
        
          peerid: session.peerid,
          peerIP: session.peerIP,
        peerPort: session.peerPort,
        
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

};

util.inherits(Stun, eventEmitter);

// db hook
Stun.db = SdpDB;

// instance methods
Stun.prototype.saveOupdate = function(fn){
    var self = this;
    
    // 1.
    // query mine as client-node
    SdpDB.getClient(self.clntsInfo.mine.gid, function(err, node){
        if (err || !node) return fn(err+'query mine client node failure');
        var mine = node;
        
        // 2.
        // query peer as client-node
        SdpDB.getClient(self.clntsInfo.peer.gid, function(err, node){
            if (err || !node) return fn(err+'query peer client node failure');
            var peer = node;
            
            // 3.
            // update the session between me and peer
            var sessinfo = {type: SdpDB.SESSION_STUN, data: self.sessionInfo};            
            SdpDB.updateSession(mine, peer, sessinfo, function(err, session){
                if (err || !session) return fn(err+'update stun session failure');                
                // 4.
                // emit update event
                self.emit('update', {mine: mine, peer: peer, session: session});
                
                // 5.
                // pass STUN back
                fn(null, {mine: mine, peer: peer, session: session});
            });
        });
    });
};

// class methods

// get stun session
exports.getStunByClntFrom = function(clntid, fn){
    SdpDB.getSessionByFromType({gid: clntid}, {type: SdpDB.SESSION_STUN}, fn);
};

exports.getStunByClntTo = function(clntid, fn){
    SdpDB.getSessionByToType({gid: clntid}, {type: SdpDB.SESSION_STUN}, fn);
};

exports.getAllStun = function(fn){
    SdpDB.getSessionsByType({type: SdpDB.SESSION_STUN}, fn);
};
