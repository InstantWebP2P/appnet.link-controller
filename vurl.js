// AppNet vURL pure JS implementation
// Copyright (c) 2012-present Tom Zhou<appnet.link@gmail.com>
// Notes: 
// - vURL has two mode: vHost-based and vPath-based
// - vURL key always is lower case

'use strict';
var debug = require('debug')('vurl');


var eventEmitter = require('events').EventEmitter,
    util         = require('util');

// pass key-value db instance 
var vURL = module.exports = exports = function(db){
    var self = this;
    
    // super constructor
    eventEmitter.call(self);
    
    self.db = db || {};
}

util.inherits(vURL, eventEmitter);

// instance method: get/put/del
vURL.prototype.get = function(vurl, fn){
    var self = this;
    
    if (vurl) {
        vurl = vurl.toLowerCase();
        
        // trip prefix or suffix
        vurl = vurl.replace('/vurl/', '');
        vurl = vurl.replace('.vurl.', '');
    } else {
        fn('invalid  vURL rootpath');
        return;
    }
    
    // only query live as true vURL
    // TBD... with persistent DB
    if (self.db[vurl] && self.db[vurl].live) {
        fn(null, self.db[vurl]);
        ///console.log('find vURL:'+JSON.stringify(self.db[vurl]));
    } else {
        fn('invalid  vURL rootpath');
    }
};

vURL.prototype.put = function(entry, fn){
    var self = this;
        
    if (!entry.vurl) {
        if (fn) fn('invalid vURL path');
    } else {
        entry.vurl = entry.vurl.toLowerCase();
        
        // trip prefix or suffix
        entry.vurl = entry.vurl.replace('/vurl/', '');
        entry.vurl = entry.vurl.replace('.vurl.', '');
        
        self.db[entry.vurl] = self.db[entry.vurl] || {};
        // filter selected fields
        Object.keys(entry).forEach(function(k){
            (self.db[entry.vurl])[k] = entry[k];
        });
        
        if (fn) fn(null, self.db[entry.vurl]);
        ///console.log('add vURL:'+JSON.stringify(entry));

        // emit add for cluster
        self.emit('add', entry);
    }
}

vURL.prototype.del = function(vurl, fn){
    var self = this;
    
    if (vurl) {
        vurl = vurl.toLowerCase();
        
        // trip prefix or suffix
        vurl = vurl.replace('/vurl/', '');
        vurl = vurl.replace('.vurl.', '');
    } else {
        if (fn) fn(null);
        return;
    }
    
    // set live as false
    if (self.db[vurl]) {
        self.db[vurl].live = false;
        if (fn) fn(null);
        ///console.log('delete vURL:'+vurl);

        // emit delete for cluster
        self.emit('delete', vurl);
    } else {
        if (fn) fn(null);
    }
}

// class methods MUST be compatible to AppNet.link

// Version 1.0
vURL.version = vURL.VERSION = '1.0';

// vURL mode, vhost:0, vpath:1
vURL.url_mode_host = vURL.URL_MODE_HOST = 0;
vURL.url_mode_path = vURL.URL_MODE_PATH = 1;

// vURL related regex
vURL.regex_url  = new RegExp('(https?)://[a-z0-9-]+(\.[a-z0-9-]+)+(/?)', 'gi');
vURL.regex_href = new RegExp('href="(/?)[a-z0-9-/\.]+(/?)"', 'gi');

// vURL like *-*.vurl., /vurl/*-*
vURL.regex_vurle = /([0-9]|[a-f]){32}/gi;

// vHost
vURL.regex_vhost = /(([0-9]|[a-f]){32}-)*([0-9]|[a-f]){32}\.vurl\./gi;

// vPath
vURL.regex_vpath = /\/vurl\/([0-9]|[a-f]){32}(-([0-9]|[a-f]){32})*/gi;

// both vHost and vPath
vURL.regex_vboth = /((([0-9]|[a-f]){32}-)*([0-9]|[a-f]){32}\.vurl\.)|(\/vurl\/([0-9]|[a-f]){32}(-([0-9]|[a-f]){32})*)/;

// vToken
vURL.regex_vtoken = /\/vtoken\/([0-9]|[a-f]){16}/gi;

