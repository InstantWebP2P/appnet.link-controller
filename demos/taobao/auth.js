var fs = require('fs');
var jf = __dirname+'/list.json';
var MSPD = 24*3600*1000; // ms/day

// check usrkey in list.json
exports.check = function(usrkey, fn){
    fs.readFile(jf, function(err, data){
 	if (err) {
	    fn('read list.json failed'+err);
	    console.log('read list.json failed'+err);
	    return;
	}
	
        var list = JSON.parse(data);
        
        // check usrkey
        if ((usrkey in list) && 
        	 list[usrkey] && 
        	 list[usrkey].live &&
        	(list[usrkey].from < Date.now()) && 
        	(list[usrkey].to > Date.now())) {
        	fn(null, list[usrkey]);
        } else {
        	fn('expired usrkey');
        }
    });
};

// add usrkey in list.json
// - account: {from: timestamp, to: timestamp, days: days}
exports.add = function(usrkey, account, fn) {
	fs.readFile(jf, function(err, data){
		if (err) {
			fn('read list.json failed'+err);
			console.log('read list.json failed'+err);
			return;
		}
		
		var list = JSON.parse(data);
		
		// check usrkey
		if (usrkey in list) {
			console.log('usrkey already existed');
			fn('usrkey already existed');
		} else {
			// add usrkey entry
			account.from = account.from || Date.now();
			account.to = account.from + account.days*MSPD;
			
			list[usrkey] = {
                                      usrkey: usrkey,
					from: account.from, 
					days: account.days, 
					  to: account.to,
					live: true // live or dead
			};
			
			// save list.json
			fs.writeFile(jf, JSON.stringify(list), function(err){
				if (err) {
					fn('write list.json failed'+err);
					console.log('write list.json failed'+err);
					return;
				}
				
				fn(null, list[usrkey]);
			});
		}
	});
};

// remove usrkey in list.json
// notes: set live flag as false
exports.remove = function(usrkey, fn) {
    exports.update(usrkey, {live: false}, fn);
};

// updae usrkey in list.json
// - account: {to: timestamp, days: days, live: true/false}
exports.update = function(usrkey, account, fn) {
	fs.readFile(jf, function(err, data){
		if (err) {
			fn('read list.json failed'+err);
			console.log('read list.json failed'+err);
			return;
		}
		
		var list = JSON.parse(data);
		
		// check usrkey
		if (usrkey in list) {
			// update usrkey entry
			if ('live' in account) {
				list[usrkey].live = account.live;
			}
			
			if ('to' in account) {
				list[usrkey].to = account.to;
				list[usrkey].days = (list[usrkey].to - list[usrkey].from) / MSPD; // days
			} else if ('days' in account) {
				list[usrkey].days = account.days;
				list[usrkey].to = list[usrkey].from + list[usrkey].days * MSPD;
			}
			
			// save list.json
			fs.writeFile(jf, JSON.stringify(list), function(err){
				if (err) {
					fn('write list.json failed'+err);
					console.log('write list.json failed'+err);
					return;
				}
				
				fn(null, list[usrkey]);
			});
		} else {
			console.log('usrkey not existed');
			fn('usrkey not existed');
		}
	});
};

// output usrkey in list.json
var list_txt = __dirname+'/list.txt';

exports.output = function(fn){
	fs.readFile(jf, function(err, data){
		if (err) {
			if (fn) fn('read list.json failed'+err);
			console.log('read list.json failed'+err);
			return;
		}

		var list = JSON.parse(data);

		// iterate every entries
		var ostr = '\t\t用户秘钥\t\t\t\t\t\t\t使用状态\t\t起始时间\t\t截止时间\t\t\t服务期限(天)\n\r';
		var rest = 0;
		for (var k in list) {
		    ostr += list[k].usrkey + '\t';
		    
		    rest =  list[k].live ? (list[k].to - Date.now()) / MSPD : 0;
		    ostr += (list[k].live ? '剩'+rest.toFixed(0)+'天' : '已过期') + '\t\t';
		    ostr += (new Date(list[k].from)).toDateString() + '\t\t';
		    ostr += (new Date(list[k].to)).toDateString() + '\t\t';
		    ostr += list[k].days + '天' + '\n';
		}
		if (fn) fn(null, ostr);
		
		fs.writeFileSync(list_txt, ostr);
	});
};

