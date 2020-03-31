// SSL binary wrapper in pure JS
// Copyright (c) 2012-present Tom Zhou<iwebpp@gmail.com>
//

var fs = require('fs');
var spawn = require('child_process').spawn;


// Generate ssl certs
// Self-signed certs like below:
// - openssl genrsa -out server-key.pem 1024
// - openssl req -new -key server-key.pem -out server-csr.pem
// - openssl x509 -req -in server-csr.pem -signkey server-key.pem -out server-cert.pem
// Or prefer below: http://www.madboa.com/geek/openssl/#cert-self
// openssl req \
//  -x509 -nodes -days 365 \
//  -subj '/C=US/ST=Oregon/L=Portland/CN=www.madboa.com' \
//  -newkey rsa:1024 -keyout server-key.pem -out server-cert.pem
// TBD... aumomatically generate ssl certs

/*
// hard-coded by now
var genSslCert = exports.genSslCert = function(filename, fn){
    fn(null, {
         key: fs.readFileSync(__dirname+'/certs/peerwww-key.pem').toString(),
        cert: fs.readFileSync(__dirname+'/certs/peerwww-cert.pem').toString()
    });
}
*/

var genSslCert = exports.genSslCert = function(filename, fn){
    // 1.
    // openssl req -x509 -nodes -days 365 -subj '/C=CN/ST=SH/L=SH/CN=www.51dese.com' -newkey rsa:1024 -keyout server-key.pem -out server-cert.pem
    var s1 = spawn('openssl',
                   ['req', '-x509', '-nodes', '-days', '365',
                    '-subj', '/C=CN/ST=SH/L=SH/CN=www.51dese.com',
                    '-newkey', 'rsa:1024',
                    '-keyout', __dirname+'/certs/'+filename+'-key.pem',
                    '-out', __dirname+'/certs/'+filename+'-cert.pem'
                   ],
                   {stdio: ['ignore', 'ignore', 'ignore']}
                  );
    
    s1.on('exit', function (code) {
        if (code !== 0) {
            console.log('s1 openssl process exited with code ' + code);
            fn('s1 openssl process exited with code ' + code);
        } else {            
            fn(null, {
                 key: fs.readFileSync(__dirname+'/certs/'+filename+'-key.pem').toString(),
                cert: fs.readFileSync(__dirname+'/certs/'+filename+'-cert.pem').toString()
            });
            
            // destroy certs
            fs.unlink(__dirname+'/certs/'+filename+'-key.pem');
            fs.unlink(__dirname+'/certs/'+filename+'-cert.pem');
        }
    });
};

/*
// simple test
(function(){
    genSslCert('test', function(err, certs){
        if (err)
            console.log(err+' genSslCert failed');
        else 
            console.log('genSslCert successfully');
    });
})();
*/
