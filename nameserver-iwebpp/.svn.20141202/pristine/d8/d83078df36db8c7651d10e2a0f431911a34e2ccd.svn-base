// security hash
// sipkey can be any user defined 4 integers, 3 sipkey generate 192bits secure number
var siphash = require('siphash'),
    sipkey1 = [0x33631111, 0x66368888, 0x55516666, 0x33838898], // magic key1
    ///sipkey2 = [0x52832681, 0x33638686, 0x51816866, 0x88638688], // magic key2
    sipkey3 = [0x51688615, 0x36383836, 0x51886615, 0x88886666]; // magic key3

var UUID = require('node-uuid');

// generate 64/128bits hashed uid
var genHuid = exports.genHuid = function(prefix){
    var uuid = UUID.v4();
    var s1 = siphash.hash_hex(sipkey1, uuid);
    ///var s2 = siphash.hash_hex(sipkey2, s1+uuid);

    var huid = s1;/// + s2; 
    
    return prefix ? prefix+':'+huid : huid;
};

// generate 64bits hashed tag
var genHtag = exports.genHtag = function(huid){
	var t = siphash.hash_hex(sipkey3, huid);
	return t;
};

// generate taged user key
var genUsrkey = exports.genUsrkey = function(prefix){
	var huid = genHuid(prefix);
	var htag = genHtag(huid);
	
	return huid+htag;
};

// verify taged user key
var verUsrkey = exports.verUsrkey = function(usrkey) {
	if (usrkey && 
		typeof usrkey === 'string' &&
		usrkey.length > 16) {
		// last 64bits or 16hex chars is tag
		var huid = usrkey.substr(0, usrkey.length-16);
		var htag = usrkey.substr(usrkey.length-16, 16);
		
		return genHtag(huid) === htag;
	} else {
		return false;
	}
};

/*
var huid = genHuid(process.argv[2] || 'ivncbox');
var htag = genHtag(huid);

console.log('new usrkey: '+huid);
console.log('tag usrkey: '+htag);
*/
