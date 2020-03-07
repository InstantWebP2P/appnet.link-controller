

var fs    = require('fs');
var spawn = require('child_process').spawn;


var genSslCert = exports.genSslCert = function(filename, info, fn){
    // check parameter
    if (typeof info === 'function') {
        fn = info;
        
        info = {};
        info.cn = 'iwebpp.com';
    }
    if (!info.cn) {
        info.cn = 'iwebpp.com';    
    }
    filename += info.cn;
    filename = filename.replace('*', 'x');

    // 1.
    // generate wildcard ssl certificate for *.vurl.iwebpp.com,*.vurl.local.iwebpp.com
    // openssl req -x509 -nodes -days 365 -subj '/C=CN/ST=SH/L=SH/CN=domain' -newkey rsa:1024 -keyout server-key.pem -out server-cert.pem
    var clistr = ['req', '-x509', '-nodes'];
    
    // duration
    if (info.days) {
        clistr.push('-days');
        clistr.push(info.days);
    } else {
        clistr.push('-days');
        clistr.push('365');
    }
    
    // subject
    clistr.push('-subj');
    clistr.push('/C=CN/ST=SH/L=SH/CN='+info.cn);
    
    // CA 
    if (info.ca_key && info.ca_cert) {
        // -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial
        clistr.push('-CA');
        clistr.push(info.ca_cert);
        
        clistr.push('-CAkey');
        clistr.push(info.ca_key);
        
        clistr.push('-CAcreateserial');
    } else {
        // -newkey rsa:1024
        clistr.push('-newkey');
        clistr.push('rsa:1024');
    }
    
    // output
    clistr.push('-keyout');
    clistr.push(__dirname+'/certs/'+filename+'-key.pem');
    
    clistr.push('-out');
    clistr.push(__dirname+'/certs/'+filename+'-cert.pem');
    
    console.log('openssl', clistr);
    var s1 = spawn('openssl', clistr, {stdio: ['ignore', 'ignore', 'ignore']});
    
    s1.on('exit', function (code) {
        if (code !== 0) {
            console.log('Warning!s1 openssl process exited with code ' + code);
            ///fn('s1 openssl process exited with code ' + code);
            // fall back to fixed certs
            fn(null, {
		         key: fs.readFileSync(__dirname+'/certs/'+'peerwww'+'-key.pem').toString(),
		        cert: fs.readFileSync(__dirname+'/certs/'+'peerwww'+'-cert.pem').toString()
		    });
        } else {		    
            try {
                fn(null, {
                     key: fs.readFileSync(__dirname+'/certs/'+filename+'-key.pem').toString(),
                    cert: fs.readFileSync(__dirname+'/certs/'+filename+'-cert.pem').toString()
                });
                
                // destroy certs
                fs.unlinkSync(__dirname+'/certs/'+filename+'-key.pem');
                fs.unlinkSync(__dirname+'/certs/'+filename+'-cert.pem');
            } catch (e) {
                console.log('Warning!open certs file failure:'+e);

                // fall back to fixed certs
                fn(null, {
                     key: fs.readFileSync(__dirname+'/certs/'+'peerwww'+'-key.pem').toString(),
                    cert: fs.readFileSync(__dirname+'/certs/'+'peerwww'+'-cert.pem').toString()
                });
            }
        }
    });
};


// simple test
(function(){
    genSslCert('test', function(err, certs){
        if (err)
            console.log(err+' genSslCert failed');
        else 
            console.log('genSslCert successfully');
    });
})();

