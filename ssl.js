// SSL binary wrapper in pure JS
// Copyright (c) 2012-present Tom Zhou<iwebpp@gmail.com>
//

'use strict';
var debug = require('debug')('ssl');


var fs   = require('fs');
var exec = require('child_process').exec;
var NET  = require('net');


// Debug level
var Debug = 0;

// Generate self-signed cert
// - openssl genrsa -out server-key.pem 2048
// - openssl req -new -key server-key.pem -out server-csr.pem
// - openssl x509 -req -in server-csr.pem -signkey server-key.pem -out server-cert.pem
//
// Or prefer in single line: http://www.madboa.com/geek/openssl/#cert-self
// openssl req  -x509 -nodes -days 365 -subj '/C=CN/ST=SH/L=SH/CN=iwebpp.com' -newkey rsa:2048 -keyout server-key.pem -out server-cert.pem
// Or create self-signed wildcard ssl certificate
// - http://security.stackexchange.com/questions/10538/what-certificates-are-needed-for-multi-level-subdomains
// - 
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
    
    // SSL CA cert generate with retry    
    function genCert(filename, info, fn) {
	    // construct openssl CLI arguments
	    var clistr = '', cliarg = ['req', '-x509', '-nodes'];
	
	    // duration
	    if (info.days) {
	        cliarg.push('-days');
	        cliarg.push(info.days);
	    } else {
	        cliarg.push('-days');
	        cliarg.push('365');
	    }
	    
	    // subject
	    cliarg.push('-subj');
	    cliarg.push('/C=CN/ST=SH/L=SH/CN='+info.cn);
	    
	    // -newkey rsa:2048
	    cliarg.push('-newkey');
	    cliarg.push('rsa:2048');
	    
	    // output
	    cliarg.push('-keyout');
	    cliarg.push(__dirname+'/certs-tmp/'+filename+'-key.pem');
	    
	    cliarg.push('-out');
	    cliarg.push(__dirname+'/certs-tmp/'+filename+'-cert.pem');
	    
	    // V3 extension, subject alternate name
	    if (info.altname && info.altname.length) {
	        // -extensions v3_req
	        cliarg.push('-extensions');
	        cliarg.push('v3_req');
	        
	        // create ssl.conf
	        var v3_conf  = '[req] \n';
	            v3_conf += '    req_extensions = v3_req \n\n';
	            v3_conf += '    [ v3_req ] \n';
                v3_conf += '    # Extensions to add to a certificate request \n';
                ///v3_conf += '    basicConstraints = CA:FALSE \n';
                ///v3_conf += '    keyUsage = nonRepudiation, digitalSignature, keyEncipherment \n';
                v3_conf += '    subjectAltName = @alt_names \n\n';
	        
	        // like 
	        // [alt_names]
	        // DNS.1 = ns3.dns.com 
	        // ... 
            // IP.1 = 192.168.1.84  
            // ...
            var ips = [], dns = [];
            
            v3_conf += '    [alt_names] \n';
	        for (var idx = 0; idx < info.altname.length; idx ++) {
	            var name = info.altname[idx];
	            
	            if (NET.isIP(name)) {
	                ips.push(name);
	            } else {
	                dns.push(name);
	            }
	        }
	        for (var idx = 0; idx < dns.length; idx ++) {
	            v3_conf += '    DNS.'+idx+' = '+dns[idx]+'\n';
	        }
	        for (var idx = 0; idx < ips.length; idx ++) {
	            v3_conf += '    IP.'+idx+' = '+ips[idx]+'\n';
	        }
	        v3_conf += '\n';
	        
	        // create file
	        try {
	            fs.writeFileSync(__dirname+'/certs-tmp/'+filename+'-v3.conf', v3_conf);
	        } catch (e) {
	             console.error('Warning!s3 syncWrite V3 conf file failed ' + e);
	            fn('Warning!s3 syncWrite V3 conf file failed ' + e);
			    
			    return;    
	        }
	        
	        // -extfile
	        cliarg.push('-extfile');
	        cliarg.push(__dirname+'/certs-tmp/'+filename+'-v3.conf');
	    }
					    	    	    
        clistr = 'openssl  '+cliarg.join('  ');
	    debug('s1 cli: '+clistr);
	    
	    var s1 = exec(clistr, {maxBuffer: 200*1024}, function(err, stdout, stderr){
	        if (err) {
	            console.error('Warning!s1 openssl process exited with error ' + err + stderr);
	            fn('Warning!s1 openssl process exited with error ' + err + stderr);
	        } else {		    
	            try {
	                fn(null, {
	                     key: fs.readFileSync(__dirname+'/certs-tmp/'+filename+'-key.pem').toString(),
	                    cert: fs.readFileSync(__dirname+'/certs-tmp/'+filename+'-cert.pem').toString()
	                });
	                
	                // destroy certs
	                fs.unlinkSync(__dirname+'/certs-tmp/'+filename+'-key.pem');
	                fs.unlinkSync(__dirname+'/certs-tmp/'+filename+'-cert.pem');
	            } catch (e) {
	                console.error('Warning!open certs file failure:'+e);
	
	                fn('Warning!open certs file failure:'+e);
	            }
	        }
	    });
    }
    
    // retry 3 times
    var retry = 0;
    
    (function regenCert(){
	    genCert(filename, info, function(err, cert){
	        if (err) {
	            if (retry < 3) {
	                // delay regen
	                setTimeout(function(){
	                    retry ++;
	                    regenCert();
	                }, 1000); // 1s delay
	            } else {
	                // pass error
	                fn('ssl certgen failed');
	            }
	        } else {
	            // pass cert
	            fn(null, cert);
	        }
	    })
    })();
};

// Generate CA-signed cert
// - openssl genrsa -out server-key.pem 2048  
// - openssl req -new -key server-key.pem -subj '/C=CN/ST=SH/L=SH/CN=iwebpp.com' -out server-csr.pem  
// - openssl x509 -req -days 730 -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial -in server-csr.pem -out server-cert.pem -extensions v3_req -extfile openssl.cnf  
// -
// - http://blog.didierstevens.com/2008/12/30/howto-make-your-own-cert-with-openssl/
// -- CA root cert:
// --- openssl genrsa -out ca-key.pem 4096
// --- openssl req -new -x509 -days 1868 -subj '/C=CN/ST=SH/L=SH/CN=iwebpp.com' -key ca-key.pem -out ca-cert.pem
// --
// -- server cert:
// --- openssl genrsa -out ia.key 2048
// --- openssl req -new -key ia.key -subj '/C=CN/ST=SH/L=SH/CN=xxx.com' -out ia.csr
// --- openssl x509 -req -days 730 -in ia.csr -CA ca.crt -CAkey ca.key -set_serial 01 -out ia.crt
// --- To use this subordinate CA key for Authenticode signatures with Microsoft¡¯s signtool, you¡¯ll have to package the keys and certs in a PKCS12 file:
// ---- openssl pkcs12 -export -out ia.p12 -inkey ia.key -in ia.crt -chain -CAfile ca.crt
// --
// --- V3 extension
// ---- http://blog.csdn.net/marujunyy/article/details/8477854
// ---- http://apetec.com/support/GenerateSAN-CSR.htm
// ---- http://blog.endpoint.com/2013/10/ssl-certificate-sans-and-multi-level.html
// ---- like san.conf
/*
[req]  
    distinguished_name = req_distinguished_name  
    req_extensions = v3_req  
  
    [req_distinguished_name]  
    countryName = Country Name (2 letter code)  
    countryName_default = CN  
    stateOrProvinceName = State or Province Name (full name)  
    stateOrProvinceName_default = BeiJing  
    localityName = Locality Name (eg, city)  
    localityName_default = YaYunCun  
    organizationalUnitName  = Organizational Unit Name (eg, section)  
    organizationalUnitName_default  = Domain Control Validated  
    commonName = Internet Widgits Ltd  
    commonName_max  = 64  
  
    [ v3_req ]  
    # Extensions to add to a certificate request  
    basicConstraints = CA:FALSE  
    keyUsage = nonRepudiation, digitalSignature, keyEncipherment  
    subjectAltName = @alt_names  
  
    [alt_names]  
    DNS.1 = ns1.dns.com  
    DNS.2 = ns2.dns.com  
    DNS.3 = ns3.dns.com  
    IP.1 = 192.168.1.84  
    IP.2 = 127.0.0.1  
    IP.3 = 127.0.0.2  
*/

var genSslCertCA = exports.genSslCertCA = function(filename, info, fn){
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
    
    // SSL CA cert generate with retry    
    function genCert(filename, info, fn) {
	    // construct openssl CLI arguments
	    var clistr = '', cliarg = [];
	    var key_out = '', csr_out = '', cert_out = '';
	    
	    // 1.
	    // - openssl genrsa -out server-key.pem 2048
	    cliarg.push('genrsa');
	    ///cliarg.push('-out');
	    ///cliarg.push(__dirname+'/certs-tmp/'+filename+'-key.pem');
	    cliarg.push('2048');
	    
	    clistr = 'openssl  '+cliarg.join('  ');
	    debug('s1 cli: '+clistr);
	    
	    var s1 = exec(clistr, {maxBuffer: 200*1024}, function(err, stdout, stderr){
	        if (err) {
	            console.log('Warning!s1 openssl process exited with error ' + err + stderr);
	            fn('Warning!s1 openssl process exited with error ' + err + stderr);
	        } else {
	            debug('s1 stdout: '+stdout); 
	            
	            // 1.1
	            // syncWrite output to file
	            key_out = stdout;
	            try {
	                fs.writeFileSync(__dirname+'/certs-tmp/'+filename+'-key.pem', key_out);
	            } catch (e) {
	                console.log('Warning!s1 syncWrite key file failed ' + e);
		            fn('Warning!s1 syncWrite key file failed ' + e);
				    
				    return;    
	            }
	            
	            // 2.
	            // - openssl req -new -key server-key.pem -subj '/C=CN/ST=SH/L=SH/CN=domain' -out server-csr.pem
	            cliarg = ['req', '-new', '-key', __dirname+'/certs-tmp/'+filename+'-key.pem'];
	            
	            // subject
				cliarg.push('-subj');
				cliarg.push('/C=CN/ST=SH/L=SH/CN='+info.cn);
			    
			    // csr output
			    ///cliarg.push('-out');
			    ///cliarg.push(__dirname+'/certs-tmp/'+filename+'-csr.pem');
			    		    
			    clistr = 'openssl  '+cliarg.join('  ');
			    debug('s2 cli: '+clistr);
			    
			    var s2 = exec(clistr, function(err, stdout, stderr){
			        if (err) {
			            console.log('Warning!s2 openssl process exited with error ' + err + stderr);
			            fn('Warning!s2 openssl process exited with error ' + err + stderr);
			        } else {
			            debug('s2 stdout: '+stdout); 
			            
			            // 2.1
			            // syncWrite output to file
			            csr_out = stdout;
			            
			            try {
			                fs.writeFileSync(__dirname+'/certs-tmp/'+filename+'-csr.pem', csr_out);
			            } catch (e) {
			                console.log('Warning!s2 syncWrite csr file failed ' + e);
				            fn('Warning!s2 syncWrite csr file failed ' + e);
						    
						    return;    
			            }		        
			            
			            // 3.
			            // - openssl x509 -req -days 730 -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial -in server-csr.pem -out server-cert.pem
			            cliarg = ['x509', '-req', '-CA', info.ca_cert, '-CAkey', info.ca_key,
			                      '-CAcreateserial', '-in', __dirname+'/certs-tmp/'+filename+'-csr.pem'];
			            
			            // duration
					    if (info.days) {
					        cliarg.push('-days');
					        cliarg.push(info.days);
					    } else {
					        cliarg.push('-days');
					        cliarg.push('365');
					    }
					    
					    // 3.1
					    // V3 extension, subject alternate name
					    if (info.altname && info.altname.length) {
					        // -extensions v3_req
					        cliarg.push('-extensions');
					        cliarg.push('v3_req');
					        
					        // create ssl.conf
					        var v3_conf  = '[req] \n';
					            v3_conf += '    req_extensions = v3_req \n\n';
					            v3_conf += '    [ v3_req ] \n';
			                    v3_conf += '    # Extensions to add to a certificate request \n';
			                    ///v3_conf += '    basicConstraints = CA:FALSE \n';
			                    ///v3_conf += '    keyUsage = nonRepudiation, digitalSignature, keyEncipherment \n';
			                    v3_conf += '    subjectAltName = @alt_names \n\n';
					        
					        // like 
					        // [alt_names]
					        // DNS.1 = ns3.dns.com 
					        // ... 
			                // IP.1 = 192.168.1.84  
			                // ...
			                var ips = [], dns = [];
			                
			                v3_conf += '    [alt_names] \n';
					        for (var idx = 0; idx < info.altname.length; idx ++) {
					            var name = info.altname[idx];
					            
					            if (NET.isIP(name)) {
					                ips.push(name);
					            } else {
					                dns.push(name);
					            }
					        }
					        for (var idx = 0; idx < dns.length; idx ++) {
					            v3_conf += '    DNS.'+idx+' = '+dns[idx]+'\n';
					        }
					        for (var idx = 0; idx < ips.length; idx ++) {
					            v3_conf += '    IP.'+idx+' = '+ips[idx]+'\n';
					        }
					        v3_conf += '\n';
					        
					        // create file
					        try {
					            fs.writeFileSync(__dirname+'/certs-tmp/'+filename+'-v3.conf', v3_conf);
					        } catch (e) {
					             console.log('Warning!s3 syncWrite V3 conf file failed ' + e);
					            fn('Warning!s3 syncWrite V3 conf file failed ' + e);
							    
							    return;    
					        }
					        
					        // -extfile
					        cliarg.push('-extfile');
					        cliarg.push(__dirname+'/certs-tmp/'+filename+'-v3.conf');
					    }
			    				    
			            clistr = 'openssl  '+cliarg.join('  ');
			            debug('s3 cli: '+clistr);
			            
					    var s3 = exec(clistr, function(err, stdout, stderr){
					        if (err) {
					            console.log('Warning!s3 openssl process exited with error ' + err + stderr);
					            fn('Warning!s3 openssl process exited with error ' + err + stderr);
					        } else {
					            debug('s3 stdout: '+stdout); 
					            
					            // 3.2
					            // caputre cert
					            cert_out = stdout;
					            
					            try {
					                fn(null, {
					                     key: key_out,
					                    cert: cert_out
					                });
					                
					                // destroy certs
					                fs.unlink(__dirname+'/certs-tmp/'+filename+'-key.pem');
					                fs.unlink(__dirname+'/certs-tmp/'+filename+'-csr.pem');
					                
					                if (info.altname && info.altname.length) 
					                    fs.unlink(__dirname+'/certs-tmp/'+filename+'-v3.conf');
					            } catch (e) {
					                console.log('Warning!s3 open certs file failure:'+e);
					                fn('Warning!s3 open certs file failure:'+e);
					            }
							}
					    });
			        }
			    });
	        }
	    });
    }
    
    // retry 3 times
    var retry = 0;
    
    (function regenCert(){
	    genCert(filename, info, function(err, cert){
	        if (err) {
	            if (retry < 3) {
	                // delay regen
	                setTimeout(function(){
	                    retry ++;
	                    regenCert();
	                }, 1000); // 1s delay
	            } else {
	                // pass error
	                fn('ssl certgen failed');
	            }
	        } else {
	            // pass cert
	            fn(null, cert);
	        }
	    })
    })();
};

// simple test
/*
(function(){
    genSslCertCA('browser-iwebpp', {
                ca_cert: './ca-certs/ca-cert.pem',
                ca_key: './ca-certs/ca-key.pem',

                days: 666,
                cn: 'iwebpp.com',
                altname: ['vurl.iwebpp.com', '*.vurl.iwebpp.com', '127.0.0.1']
    },
    function(err, certs){
        if (err)
            console.log(err+' genSslCertCA failed');
        else
            console.log('genSslCertCA successfully: '+JSON.stringify(certs));

            fs.writeFileSync('webrowser-cert.pem', certs.cert);
            fs.writeFileSync('webrowser-key.pem', certs.key);
    });
})();
*/

