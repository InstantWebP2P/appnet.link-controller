// Copyright (c) 2012-present Tom Zhou<iwebpp@gmail.com>
//
// graphDB used to record SDP, establish peer connection's topology
// notes: 
// 1. SDP record will be mapped to client-node, server-node and their relationship;
// 2. client-node represents User entity, server-node is nameserver entity;
// 3. the relationship describe the session between user and name server;
// 4. server-node was identified by nameserver IP&Port;
// 5. client-node was identified by it's local IP&Port&devkey;
// 5.1 device-node was identified by it's devkey;
// 6. user-node was identified by User's domain+usrkey;
// 7. multiple sessions can co-exist between nameserver and User entity;
// 8. session consists of (nameserver ip&port)+(Users's domain+usrkey)+(nameclient local ip&port)+(devkey),
//    that means one user can login to nameserver from different devices;
// 9. router-node was identified by it's public IP&Port;
// 10. using traceroute to setup the multi-hop route info between server-node and client-node;
// 11. user can login to multiple clients, while a client means a device with local proto/ip/port;
// ...

var debug = require('debug')('db.sdp');
var neo4j = require('neo4jv1');
var db    = new neo4j.GraphDatabase(process.env.NEO4J_URL || 'http://localhost:7474');


// node types:
// 0: name server like stun server,
// 1: client,
// 2: router,
// 3: relay server like turn server,
// 4: user,
// 5: device, which client running on and has unique devkey!!!
exports.NODE_NMSRV    = 0;
exports.NODE_CLIENT   = 1;
exports.NODE_ROUTER   = 2;
exports.NODE_RELAYSRV = 3;
exports.NODE_USER     = 4;
exports.NODE_DEVICE   = 5;

// Session Types:
// 0: SDP        (client<-->nmsrv),
// 1: STUN       (client<-->client),
// 2: TURN       (client<->relaysrv<->client),
// 3: NextHop    (nmsrv<.-.>router<.-.>client),
// 4: Login      (user<->client),
// 5: TURN Proxy (initiator client<->relay proxy server),
// 6: TURN Agent (relay agent client<->responder client),
// 7: TURN Punch (responder client<->relay agent server)
// 8: RunOn      (client<->device)
exports.SESSION_SDP        = 'SESSION_SDP';
exports.SESSION_STUN       = 'SESSION_STUN';
exports.SESSION_TURN       = 'SESSION_TURN';
exports.SESSION_NEXT       = 'SESSION_NEXT'; // next hop
exports.SESSION_LOGIN      = 'SESSION_LOGIN';
exports.SESSION_TURN_PROXY = 'SESSION_TURN_PROXY';
exports.SESSION_TURN_AGENT = 'SESSION_TURN_AGENT';
exports.SESSION_TURN_PUNCH = 'SESSION_TURN_PUNCH';
exports.SESSION_RUNON      = 'SESSION_RUNON';

// NAT/FW types:
// 0: Asymmetric NAT/FW
// 1:  Symmetric NAT/FW
exports.NAT_ASYM = 0;
exports.NAT_SYMM = 1;

// add/edit/delete/update on node
var addNode = function(data, fn){
    var node = db.createNode(data);
    
    // 1.
    // persist node
    node.save(function(err){
        if (err) return fn(err+',created node failed gid@'+data.gid);    
        
        // 2.
        // indexing gid
        node.index('SdpGids', 'gid', data.gid, function(err) {
            if (err) return fn(err+',created gid index failed gid@'+data.gid);

            // 3.
            // indexing type
            node.index('SdpGtypes', 'gtype', data.type, function(err) {
                if (err) return fn(err+',created type index failed type@'+data.type);
                debug('added node:'+JSON.stringify(node));
                
                // 4.
                // index devkey,natype in client node
                if (data.type === exports.NODE_CLIENT) {
                    node.index('SdpGdevkey', 'gdevkey', data.devkey, function(err) {
                        if (err) return fn(err+',created devkey index failed devkey@'+data.devkey);
                        
                        // 4.1
                        // if has natype
                        if ('natype' in data) {
                            node.index('SdpGnatype', 'gnatype', data.natype, function(err) {
                                if (err) return fn(err+',created natype index failed natype@'+data.natype);
                                fn(null, node);
                            });
                        } else {
                            fn(null, node);
                        }
                    });
                } else if (data.type === exports.NODE_USER) {
                    // 5.
                    // index domain in user node
                    node.index('SdpGdomain', 'gdomain', data.domain, function(err) {
                        if (err) return fn(err+',created domain index failed domain@'+data.domain);
                        fn(null, node);
                    });
                } else {
                    fn(null, node);
                }
            });
        });
    });
};

var editNode = function(gid, data, fn){
    // 1.
    // query
    db.getIndexedNode('SdpGids', 'gid', gid, function(err, node){
        if (err) return fn(err+',unknown node gid@'+gid);
        
        // 2.
        // update property
        for (var k in data) {
            node._data.data[k] = data[k];
        }

        // 3.
        // persist again
        node.save(function(err){
            if (err) return fn(err+',update node failed');
            fn(null, node);
        });
    });
};

var delNode = function(gid, fn, force){
    var f = force || false;
    
    // 1.
    // query node
    db.getIndexedNode('SdpGids', 'gid', gid, function(err, node){
        if (err || !node) {
            console.log(err+',unknown node gid@'+gid);
            fn(null);
        } else {
            // 2.
            // delete node
            node.del(fn, f);
        }
    });
};

// query then edit node, or create node
var updateNode = function(gid, data, fn){
    // keep gid consistently
    data.gid = gid;
            
    // 1.
    // query firstly
    db.getIndexedNode('SdpGids', 'gid', gid, function(err, node){
        debug('updateNode@:'+gid+':'+JSON.stringify(node));
        
        if (err || !node) {
            console.log(err+',unknown node gid@'+gid);
            // 2.
            // create new node
            addNode(data, fn);
        } else {
            // 2.
            // edit secondly
            
            // 2.1
            // update property
            for (var k in data) {
                if (data.hasOwnProperty(k)) node._data.data[k] = data[k];
            }
            
            // 2.2
            // persist again
            node.save(function(err){
                if (err) return fn(err+',update node failed');
                fn(null, node);
            });
        }
    });
};

// name server
exports.addNmsrv = function(srv, fn){
    srv.type = exports.NODE_NMSRV;
    addNode(srv, function(err, node){
        if (err) return fn(err+',add nmsrv failed');
        fn(null, node._data.data);
    });
};

exports.editNmsrv = function(gid, data, fn){
    editNode(gid, data, function(err, node){
        if (err) return fn(err+',edit nmsrv failed');
        fn(null, node._data.data);
    });
};

exports.delNmsrv = function(gid, fn, force){
    delNode(gid, function(err, node){
        if (err) return fn(err+',delete nmsrv failed');
        fn(null);
    }, force);
};

exports.updateNmsrv = function(gid, data, fn){
    data.type = exports.NODE_NMSRV;
    updateNode(gid, data,  function(err, node){
        if (err) return fn(err+',update nmsrv failed');
        fn(null, node._data.data);
    });
};

// relay server
exports.addRelaysrv = function(srv, fn){
    srv.type = exports.NODE_RELAYSRV;
    addNode(srv,  function(err, node){
        if (err) return fn(err+',add relay srv failed');
        fn(null, node._data.data);
    });
};

exports.editRelaysrv = function(gid, data, fn){
    editNode(gid, data,  function(err, node){
        if (err) return fn(err+',edit relay srv failed');
        fn(null, node._data.data);
    });
};

exports.delRelaysrv = function(gid, fn, force){
    delNode(gid,  function(err, node){
        if (err) return fn(err+',delete relay srv failed');
        fn(null);
    }, force);
};

exports.updateRelaysrv = function(gid, data, fn){
    data.type = exports.NODE_RELAYSRV;
    updateNode(gid, data,  function(err, node){
        if (err) return fn(err+',update nmsrv failed');
        fn(null, node._data.data);
    });
};

// add/edit/delete on client node
exports.addClient = function(clnt, fn){
    clnt.type = exports.NODE_CLIENT;
    addNode(clnt, function(err, node){
        if (err) return fn(err+',add client failed');
        fn(null, node._data.data);
    });
};

exports.editClient = function(gid, data, fn){
    editNode(gid, data, function(err, node){
        if (err) return fn(err+',edit client failed');
        fn(null, node._data.data);
    });
};

exports.delClient = function(gid, fn, force){
    delNode(gid, function(err, node){
        if (err) return fn(err+',delete client failed');
        fn(null);
    }, force);
};

exports.updateClient = function(gid, data, fn){
    data.type = exports.NODE_CLIENT;
    updateNode(gid, data, function(err, node){
        if (err) return fn(err+',update client failed');
        fn(null, node._data.data);
    });
};

// add/edit/delete on device node
exports.addDevice = function(dev, fn){
    dev.type = exports.NODE_DEVICE;
    addNode(clnt, function(err, node){
        if (err) return fn(err+',add device failed');
        fn(null, node._data.data);
    });
};

exports.editDevice = function(gid, data, fn){
    editNode(gid, data, function(err, node){
        if (err) return fn(err+',edit device failed');
        fn(null, node._data.data);
    });
};

exports.delDevice = function(gid, fn, force){
    delNode(gid, function(err, node){
        if (err) return fn(err+',delete device failed');
        fn(null);
    }, force);
};

exports.updateDevice = function(gid, data, fn){
    data.type = exports.NODE_DEVICE;
    updateNode(gid, data, function(err, node){
        if (err) return fn(err+',update device failed');
        fn(null, node._data.data);
    });
};

// add/edit/delete on user node
exports.addUser = function(usr, fn){
    usr.type = exports.NODE_USER;
    addNode(clnt, function(err, node){
        if (err) return fn(err+',add user failed');
        fn(null, node._data.data);
    });
};

exports.editUser = function(gid, data, fn){
    editNode(gid, data,  function(err, node){
        if (err) return fn(err+',edit user failed');
        fn(null, node._data.data);
    });
};

exports.delUser = function(gid, fn, force){
    delNode(gid,  function(err, node){
        if (err) return fn(err+',delete user failed');
        fn(null);
    }, force);
};

exports.updateUser = function(gid, data, fn){
    data.type = exports.NODE_USER;
    updateNode(gid, data, function(err, node){
        if (err) return fn(err+',update user failed');
        fn(null, node._data.data);
    });
};

// add/edit/delete on router-node
exports.addRouter = function(rutr, fn){
    rutr.type = exports.NODE_ROUTER;
    addNode(rutr, function(err, node){
        if (err) return fn(err+',add router failed');
        fn(null, node._data.data);
    });
};

exports.editRouter = function(gid, data, fn){
    editNode(gid, data, function(err, node){
        if (err) return fn(err+',edit router failed');
        fn(null, node._data.data);
    });
};

exports.delRouter = function(gid, fn, force){
    delNode(gid,  function(err, node){
        if (err) return fn(err+',delete router failed');
        fn(null);
    }, force);
};

exports.updateRouter = function(gid, data, fn){
    data.type = exports.NODE_ROUTER;
    updateNode(gid, data, function(err, node){
        if (err) return fn(err+',update router failed');
        fn(null, node._data.data);
    });
};

// add/edit/delete/update on session (the relationship between nodes)
// 1. session.type can be 0: sdp, 1: stun, 2: turn, 3: nexthop, 4: login;
// 2. sdp means session between client and nameserver;
// 3. stun means session between clients;
// 4. turn means session between client and turnserver;
// 5. nexthop means node's next router;
// 6. login means session between user and client
// 7. have and only have one type of session between two nodes
var addSession = function(clnt, srv, session, fn){
    // 1.
    // query client and server node
    db.getIndexedNode('SdpGids', 'gid', clnt.gid, function(err, node){
        if (err) return fn(err + ',please create client node first gid@'+clnt.gid);
        var from = node;
        
        debug('from@'+JSON.stringify(from)+' from.gid@'+clnt.gid);
        
        db.getIndexedNode('SdpGids', 'gid', srv.gid, function(err, node){
            if (err) return fn(err+',please create server node first gid@'+srv.gid);
            var to = node;
            
            debug('to@\n'+JSON.stringify(to)+' to.gid@'+srv.gid);
            // 2.
            // create session as relationship
            from.createRelationshipTo(to, session.type, session.data, function(err, rel){
                if (err) return fn(err+',created relationship failed rel type@'+session.type);    
                debug('added session:'+JSON.stringify(rel));
                // indexing relationship type always
                rel.index('SdpGreltype', 'greltype', session.type, function(err) {
                    if (err) return fn(err+',created reltype index failed reltype@'+session.type);
                    fn(null, rel);
                });
            });
        });
    });
};

var editSession = function(clnt, srv, session, fn){
    // 1.
    // query relationship
    var qs = [
        'START from=node:SdpGids(gid="FGID"),to=node:SdpGidss(gid="TGID")',
        'MATCH (from)-[rel:RTYPE]->(to)',
        'RETURN rel'
    ].join('\n')
    .replace( 'FGID', clnt.gid)
    .replace( 'TGID', srv.gid)
    .replace('RTYPE', session.type);

    debug(qs);
    db.query(qs, null, function(err, rslts){
        if (err) return fn(err+',query relationship failed @\n'+qs);

        var rel = rslts[0] && rslts[0].rel;
        // 2.
        // update property
        for (var k in session.data) {
            rel._data.data[k] = session.data[k];
        }

        // 3.
        // persist again
        rel.save(function(err){
            if (err) return fn(err+',update session failed');
            
            fn(null, rel);
        });
    });
};

var delSession = function(clnt, srv, session, fn){
    // 1.
    // query relationship
    var qs = [
        'START from=node:SdpGidss(gid="FGID"),to=node:SdpGidss(gid="TGID")',
        'MATCH (from)-[rel?:RTYPE]->(to)',
        'RETURN rel'
    ].join('\n')
    .replace( 'FGID', clnt.gid)
    .replace( 'TGID', srv.gid)
    .replace('RTYPE', session.type);

    debug(qs);
    db.query(qs, null, function(err, rslts){
        if (err || !rslts || (rslts.length === 0)) {
            console.log(err+',nothing to do, session not existed @\n'+qs);
            return fn(null);
        }
        
        // 2.
        // delete session
        var rel = rslts[0] && rslts[0].rel;
        rel['delete'](function(err){
            if (err) return fn(err+',delete session failed rel@'+rel);
            fn(null);
        });
    });
};

// query then edit, or create new session
var updateSession = exports.updateSession = function(clnt, srv, session, fn){
    // 1.
    // query firstly
    var qs = [
        'START from=node:SdpGids(gid="FGID"),to=node:SdpGids(gid="TGID")',
        'MATCH (from)-[rel:RTYPE]->(to)',
        'RETURN rel'
    ].join('\n')
    .replace( 'FGID', clnt.gid)
    .replace( 'TGID', srv.gid)
    .replace('RTYPE', session.type);

    debug(qs);
    db.query(qs, null, function(err, rslts){
        if (err || !rslts || (rslts.length === 0)) {
            console.log(err+',query relationship failed @\n'+qs);
            // 2.
            // create new session
            addSession(clnt, srv, session, function(err, rel){
                if (err) return fn(err+',add session failed');
                fn(null, rel._data.data);
            });
        } else {
            // 2.
            // edit secondly
            debug('update session:'+JSON.stringify(rslts));
            
            var rel = rslts[0] && rslts[0].rel;
            // 2.1
            // update property
            for (var k in session.data) {
                if (session.data.hasOwnProperty(k)) rel._data.data[k] = session.data[k];
            }
            
            // 2.2
            // persist again
            rel.save(function(err){
                if (err) return fn(err+',update session failed');
                fn(null, rel._data.data);
            });
        }
    });
};

// query node info
// notes: assume node Gid is unique, while node Gtype can be duplicate
var getNodeById = exports.getNodeById = function(gid, fn){
   db.getIndexedNodes('SdpGids', 'gid', gid, function(err, nodes){
        if (err || !nodes || (nodes.length === 0)) return fn(err + ',unknown node gid@'+gid);
        debug('getNodeById@'+gid+JSON.stringify(nodes[0]));
        fn(null, nodes[0]._data.data);
    });
};

var getNodeByType = exports.getNodeByType = function(type, fn){
   db.getIndexedNodes('SdpGtypes', 'gtype', type, function(err, nodes){
        if (err || !nodes || (nodes.length === 0)) return fn(err + ',unknown node type@'+type);
        var rets = [];
        for (var i = 0; i < nodes.length; i ++) {
            rets.push(nodes[i]._data.data);
        }
        fn(null, rets);
    });
};

// query name server info
exports.getNmsrv = function(gid, fn){
    getNodeById(gid, fn);
};

exports.getNmsrvs = function(fn){
    getNodeByType(exports.NODE_NMSRV, fn);
};

// query relay server info
exports.getRelaysrv = function(gid, fn){
    getNodeById(gid, fn);
};

exports.getRelaysrvs = function(fn){
    getNodeByType(exports.NODE_RELAYSRV, fn);
};

// query router info
exports.getRouter = function(gid, fn){
    getNodeById(gid, fn);
};

exports.getRouters = function(fn){
    getNodeByType(exports.NODE_ROUTER, fn);
};

// query client info
exports.getClient = function(gid, fn){
    getNodeById(gid, fn);
};

exports.getClients = function(fn){
    getNodeByType(exports.NODE_CLIENT, fn);
};

// query device info
exports.getDevice = function(gid, fn){
    getNodeById(gid, fn);
};

exports.getDevices = function(fn){
    getNodeByType(exports.NODE_DEVICE, fn);
};

// query user info
exports.getUser = function(gid, fn){
    getNodeById(gid, fn);
};

exports.getUsers = function(fn){
    getNodeByType(exports.NODE_USER, fn);
};

// query session info
var getSessionByFromTo = exports.getSessionByFromTo = function(clnt, srv, fn){
    // 1.
    // query relationship
    var qs = [
        'START from=node:SdpGids(gid="FGID"), to=node:SdpGids(gid="TGID")',
        'MATCH (from)-[rel]->(to)',
        'RETURN from, to, rel'
    ].join('\n')
    .replace( 'FGID', clnt.gid)
    .replace( 'TGID', srv.gid);

    debug(qs);
    db.query(qs, null, function(err, rslts){
        if (err || !rslts || (rslts.length === 0)) return fn(err+'query relationship failed @\n'+qs);

        debug('session: from@'+clnt.gid+' to@'+srv.gid+':'+JSON.stringify(rslts));
        fn(null, {from: rslts[0].from._data.data, to: rslts[0].to._data.data, rel: rslts[0].rel._data.data});
    });
};

var getSessionsByFromType = exports.getSessionByFromType = function(clnt, session, fn){
    // 1.
    // query relationship
    var qs = [
        'START from=node:SdpGids(gid="FGID")',
        'MATCH (from)-[rel:RTYPE]->(to)',
        'RETURN from, to, rel'
    ].join('\n')
    .replace( 'FGID', clnt.gid)
    .replace('RTYPE', session.type);
    
    debug(qs);
    db.query(qs, null, function(err, rslts){
        if (err || !rslts || (rslts.length === 0)) return fn(err+',query relationship failed @\n'+qs);

        debug('session@'+session.type+' from@'+clnt.gid+' :'+JSON.stringify(rslts));
        
        var rets = [];
        for (var i = 0; i < rslts.length; i ++) {
            rets.push({from: rslts[i].from._data.data, to: rslts[i].to._data.data, rel: rslts[i].rel._data.data});
        }
        fn(null, rets);
    });
};

var getSessionsByToType = exports.getSessionByToType = function(clnt, session, fn){
    // 1.
    // query relationship
    var qs = [
        'START to=node:SdpGids(gid="TGID")',
        'MATCH (from)-[rel:RTYPE]->(to)',
        'RETURN from, to, rel'
    ].join('\n')
    .replace( 'TGID', clnt.gid)
    .replace('RTYPE', session.type);
    
    debug(qs);
    db.query(qs, null, function(err, rslts){
        if (err || !rslts || (rslts.length === 0)) return fn(err+',query relationship failed @\n'+qs);

        debug('session@'+session.type+' to@'+clnt.gid+' :'+JSON.stringify(rslts));
        
        var rets = [];
        for (var i = 0; i < rslts.length; i ++) {
            rets.push({from: rslts[i].from._data.data, to: rslts[i].to._data.data, rel: rslts[i].rel._data.data});
        }
        fn(null, rets);
    });
};

var getSessionsByType = exports.getSessionsByType = function(session, fn){
    // 1.
    // query relationship
    var qs = [
        'START from=node(*)',
        'MATCH (from)-[rel:RTYPE]->(to)',
        'RETURN from, to, rel'
    ].join('\n')
    .replace('RTYPE', session.type);
    
    debug(qs);
    db.query(qs, null, function(err, rslts){
        if (err || !rslts || (rslts.length === 0)) return fn(err+',query relationship failed @\n'+qs);

        debug('session@'+session.type+' :'+JSON.stringify(rslts));
        
        var rets = [];
        for (var i = 0; i < rslts.length; i ++) {
            rets.push({from: rslts[i].from._data.data, to: rslts[i].to._data.data, rel: rslts[i].rel._data.data});
        }
        fn(null, rets);
    });
};

// update session info
var updateSessionsByFromType = exports.updateSessionsByFromType = function(clnt, session, fn){
    // 1.
    // query relationship
    var qs = [
        'START from=node:SdpGids(gid="FGID")',
        'MATCH (from)-[rel:RTYPE]->(to)',
        'RETURN from, to, rel'
    ].join('\n')
    .replace( 'FGID', clnt.gid)
    .replace('RTYPE', session.type);
    
    debug(qs);
    db.query(qs, null, function(err, rslts){
        if (err || !rslts || (rslts.length === 0)) return fn(err+',query relationship failed @\n'+qs);

        debug('session@'+session.type+' from@'+clnt.gid+' :'+JSON.stringify(rslts));
        
        // 2.
        // update every sessions
        var cnt = 0;
        for (var i = 0; i < rslts.length; i ++) {
	        var rel = rslts[i] && rslts[i].rel;
	        
	        // 2.1
	        // update property
	        for (var k in session) {
	            if (session.hasOwnProperty(k)) rel._data.data[k] = session[k];
	        }
	        
	        // 2.2
	        // persist again
	        rel.save(function(err){
	            cnt ++;
	            
	            if (err) return fn(err+',update session failed');
	            if (cnt === rslts.length) fn(null, rel._data.data);
	        });
        }
    });
};

// test node existence
exports.testNodeById = function(gid, fn){
    getNodeById(gid, function(err, node){
        if (err || !node) {
            fn(null, 0);
        } else {
            fn(null, 1);
        }
    });
};

exports.testNodeByType = function(tp, fn){
    getNodeByType(tp, function(err, nodes){
        if (err || !nodes || (0 === nodes.length)) {
            fn(null, 0);
        } else {
            fn(null, 1);
        }
    });
};

// test session existence
exports.testSession = function(clnt, srv, session, fn){
    // 1.
    // query session existence
    var qs = [
        'START from=node:SdpGids(gid="FGID"),to=node:SdpGids(gid="TGID")',
        'MATCH (from)-[rel:RTYPE]->(to)',
        'RETURN rel'
    ].join('\n')
    .replace( 'FGID', clnt.gid)
    .replace( 'TGID', srv.gid)
    .replace('RTYPE', session.type);
    
    debug(qs);
    db.query(qs, null, function(err, rslts){
        if (err || !rslts || (rslts.length === 0)) {
            fn(null, 0);
        } else {
            fn(null, 1);
        }
    });
};

// traverse network topology
exports.traverse = function(desc, fn){
    db.query(desc, null, function(err, rslt){
        if (err) return fn(err+',traverse failed @\n'+desc);
        fn(null, rslt);
    });
};

// recommendation engine
exports.recommendationEngine = function(desc, fn){
    
};

