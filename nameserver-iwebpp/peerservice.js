// iWebPP Peer-Service store pure JS implementation
// Copyright (c) 2012-present Tom Zhou<iwebpp@gmail.com>
// Notes: a peer-service MUST be described by domain, usrkey and cate, and identified by vURL.

var eventEmitter = require('events').EventEmitter,
    util = require('util');

// Debug level
var Debug = 0;

// pass key-value db instance 
var peerService = module.exports = exports = function(db){
    var self = this;
    
    // super constructor
    eventEmitter.call(self);
    
    self.db = db || {};
}

util.inherits(peerService, eventEmitter);

// instance method: _genIndex, _parseKeys
// index like: domain:usrkey:cate:
peerService.prototype._genIndex = function(keys){
    var indx = '';
    
    if (keys && keys.domain) 
        indx += keys.domain + ':';
    else 
        indx += 'any:';
        
    if (keys && keys.usrkey) 
        indx += keys.usrkey + ':';
    else 
        indx += 'any:';    
        
    if (keys && keys.cate) 
        indx += keys.cate + ':';
    else 
        indx += 'any:';   
        
    return indx;
};

peerService.prototype._parseKeys = function(index){
    var strs = index.split(':');
    var keys = {};
    
    if (strs[0] === 'any') {
        keys.domain = null;
    } else {
        keys.domain = strs[0];
    }
    
    if (strs[1] === 'any') {
        keys.usrkey = null;
    } else {
        keys.usrkey = strs[1];
    }
    
    if (strs[2] === 'any') {
        keys.cate = null;
    } else {
        keys.cate = strs[2];
    }
    
    return keys;
};

// instance method: get/put/del
peerService.prototype.get = function(entry, fn){
    var self = this;
    var indx = self._genIndex(entry);
    
    // TBD... wildcards query
    if (indx.match('any:')) {
        fn('invalid get service keys');
        return;
    }
    
    function matchEntry(obj, select){
        var yes = true;
        
        // TBD... select full fields
        ['cate', 'domain', 'usrkey', 'live'].forEach(function(k){
            if (!(obj[k] === select[k])) yes = false;
        });
        
        return yes;
    }
    
    if ((indx in self.db) && self.db[indx]) {
        var rslt = {};
        
        // filter selected fields
        Object.keys(self.db[indx]).forEach(function(k){
            if (matchEntry((self.db[indx])[k], entry)) rslt[k] = (self.db[indx])[k];
        });
        
        fn(null, rslt);
        if (Debug) console.log('find service:'+JSON.stringify(rslt));
    } else {
        fn('invalid service keys');
    }
};

peerService.prototype.put = function(entry, fn){
    var self = this;
    var indx = self._genIndex(entry);
    
    // TBD... wildcards query
    if (indx.match('any:') || !entry.vurl) {
        if (fn) fn('invalid put service keys');
        return;
    }
        
    self.db[indx] = self.db[indx] || {};
    (self.db[indx])[entry.vurl] = (self.db[indx])[entry.vurl] || {};
    
    // filter selected fields
    Object.keys(entry).forEach(function(k){
        ((self.db[indx])[entry.vurl])[k] = entry[k];
    });
    
    if (fn) fn(null, (self.db[indx])[entry.vurl]);
    if (Debug) console.log('add peer service:' + JSON.stringify(entry));

    // emit add for cluster
    self.emit('add', entry);
}

peerService.prototype.del = function(entry, fn){
    var self = this;
    var indx = self._genIndex(entry);
    
    // TBD... wildcards query
    if (indx.match('any:')) {
        if (fn) fn('invalid del service keys');
        return;
    }
        
    if (indx in self.db) {
        if (entry.vurl) {
            if (entry.vurl in self.db[indx]) 
                (self.db[indx])[entry.vurl] = null;    
        } else {
            self.db[indx] = null;
        }
        if (fn) fn(null);
        if (Debug) console.log('delete peer service:' + entry);

        // emit delete for cluster
        self.emit('delete', entry);
    } else {
        if (fn) fn(null);
    }
}

// clear by vURL
peerService.prototype.clrByvURL = function(vurl, fn){
    var self = this;
    
    Object.keys(self.db).forEach(function(k){
        if (self.db[k] && (typeof self.db[k] === 'object'))
            Object.keys(self.db[k]).forEach(function(kk){
                // set live flag as false
                if (kk.match(vurl))
                    ((self.db[k])[kk])['live'] = false;
            });
    });
    
    if (fn) fn(null);

    // emit clear for cluster
    self.emit('clear', vurl);
};
