/*
Copyright (c) 2010, Gregg Tavares
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice,
      this list of conditions and the following disclaimer.

    * Redistributions in binary form must reproduce the above copyright notice,
      this list of conditions and the following disclaimer in the documentation
      and/or other materials provided with the distribution.

    * Neither the name of Gregg Tavares, nor the names of its
      contributors may be used to endorse or promote products derived from this
      software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

g = {
  startHTML:
    '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">' +
    '<html>' +
    '<head>' +
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">' +
    '<meta' +
    ' name="viewport"' +
    ' content="width=100%; ' +
    '         initial-scale=1;' +
    '         maximum-scale=1;' +
    '         minimum-scale=1; ' +
    '         user-scalable=no;"' +
    '/>' +
    '<style>' +
    'html, body {' +
    '  width: 100%;' +
    '  height: 100%;' +
    '  border: 0px;' +
    '  padding: 0px;' +
    '  margin: 0px;' +
    '  background-color: #444;' +
    '  font-family: sans-serif;' +
    '}' +
    '</style>' +
    '<link type="text/css" href="/nodeimageserver-js/jquery-ui-1.8.2.custom/css/ui-lightness/jquery-ui-1.8.2.custom.css" rel="stylesheet" />' +
    '<script type="text/javascript" src="/nodeimageserver-js/jquery-ui-1.8.2.custom/js/jquery-1.4.2.min.js"></script>' +
    '<script type="text/javascript" src="/nodeimageserver-js/jquery-ui-1.8.2.custom/js/jquery-ui-1.8.2.custom.min.js"></script>' +
    '</head>' +
    '<body>',
  listHTML: '<script type="text/javascript" src="/nodeimageserver-js/list.js"></script>',
  endHTML: '</body></html>',
  port: 8080
};

function extension(path) {
  var m = path.match(/\.[^\./]+$/);
  return m ? m[0].toLowerCase() : "";
}

function startsWith(str, prefix) {
  return (str.length >= prefix.length) && str.substr(0, prefix.length) == prefix;
}

var getMimeType = function() {
  var mimeTypeMap = {
    '.jpg': 'image/jpeg',
    '.swf': 'application/x-shockwave-flash',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.gif': 'image/gif',
    '.png': 'image/png',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.html': 'text/html'
  };

  return function(path) {
    var ext = extension(path);
    var mimeType = mimeTypeMap[ext];
    return mimeType;
  }
}();

var http = require('http'),
    url = require('url'),
    fs = require('fs'),
    sys = require('sys'),
    path = require('path'),
    querystring = require('querystring');

for (var ii = 2; ii < process.argv.length; ++ii) {
  var flag = process.argv[ii];
  //sys.print("" + ii + ":" + flag + "\n");
  switch (flag) {
  case '-h':
  case '--help':
    sys.print(
        "--help: this message\n" +
        "--port: port. Default 8080\n");
    process.exit(0);
  case '--port':
    g.port = parseInt(process.argv[++ii]);
    //sys.print("port: " + g.port + "\n");
    break;
  }
}

function makeLink(url, text) {
  return '<li><a href="' + url + '">' + text + '</a></li>';
}

send404 = function(res){
  res.writeHead(404);
  res.write('404');
  res.end();
};

// hook on iwebpp.io name-client
var nmSrv = require('../iwebpp.io-server');
var WEBPP = nmSrv.Client;
var SEP = nmSrv.SEP;

var express = require('express');
    
var nmcln = new WEBPP({
    srvinfo: {
        timeout: 20,
        endpoints: [{ip: 'www.iwebpp.com', port: 51686}, {ip: 'www.iwebpp.com', port: 51868}],
        turn: [
            {ip: 'www.iwebpp.com', agent: 51866, proxy: 51688} // every turn-server include proxy and agent port
        ]
    },
    usrinfo: {domain: '51dese.com', usrkey: 'dese'},
    conmode: SEP.SEP_MODE_CS // c/s mode as httpp server
});

nmcln.on('ready', function(){
    console.log('name-client ready on vpath:'+nmcln.vpath);
    	
	// image view logics
	// notes: always put nmcln.vpath as root path
	var server = function(req, res){
	  // your normal server code
	  var filePath = querystring.unescape(url.parse(req.url).pathname);
	  sys.print('filePath:'+filePath);
	  var fullPath = path.join(process.cwd(), filePath);
	  if (startsWith(filePath, "/nodeimageserver-js/")) {
	    var fullPath = path.join(__dirname, filePath);
	  }
	  sys.print(" fullpath: " + fullPath + "\n");
	  fs.stat(fullPath, function(err, stats) {
	    if (err) {
	      sys.print("fs.stat Err:" + err + "\n");
	      send404(res);
	    } else if (stats.isDirectory()) {
	      fs.readdir(fullPath, function(err, files) {
	        if (err) {
	          sys.print("fs.readdir Err:" + err + "\n");
	          send404(res)
	        } else {
	          var fileStrs = [g.startHTML, g.listHTML, '<ul>'];
	          if (filePath.length > 1) {
	            fileStrs.push(makeLink(nmcln.vpath+path.dirname(filePath), ".."));
	          }
	          files.sort(function(a,b){
	            a = a.toLowerCase();
	            b = b.toLowerCase();
	            if (a > b) return 1;
	            if (a < b) return -1;
	            return 0;
	          });
	          for (var ii = 0; ii < files.length; ++ii) {
	            var file = files[ii];
	            if (!startsWith(file, ".")) {
	              fileStrs.push(makeLink(nmcln.vpath+path.join(filePath, file), file));
	            }
	          }
	          fileStrs.push('</ul>');
	          fileStrs.push(g.endHTML);
	          res.writeHead(200, {'Content-Type': 'text/html'});
	          res.write(fileStrs.join(""));
	          res.end();
	        }
	      });
	    } else if (stats.isFile()) {
	      var mimeType = getMimeType(filePath);
	      if (mimeType) {
	        fs.readFile(fullPath, function(err, data){
	          if (err) {
	            return send404(res);
	          }
	          res.writeHead(200, {'Content-Type': mimeType});
	          res.write(data, 'utf8');
	          res.end();
	        });
	      } else send404(res);
	    } else {
	      sys.print("Other\n");
	    }
	  });
	};
	
	// hook app on business server
    var app = express();
    app.use(nmcln.vpath, server);
    nmcln.bsrv.srv.on('request', app);
    
    // monitor network performance
    nmcln.bsrv.srv.on('connection', function(socket){
    
        var intl = setInterval(function(){
            ///console.log('socket network performance:'+JSON.stringify(socket.netPerf));
            if (socket) {
	            var perf = socket.netPerf;
	                     
	            console.log('socket network Bandwidth       :'+JSON.stringify(perf.mbpsBandwidth)+' Mb/s');
	            console.log('socket network RTT             :'+JSON.stringify(perf.msRTT)+' ms');
	            console.log('socket network PktSndPeriod    :'+JSON.stringify(perf.usPktSndPeriod)+' us');
	            console.log('socket network SendRate        :'+JSON.stringify(perf.mbpsSendRate)+' Mb/s');
	            console.log('socket network RecvRate        :'+JSON.stringify(perf.mbpsRecvRate)+' Mb/s');
	            console.log('socket network CongestionWindow:'+JSON.stringify(perf.pktCongestionWindow));
	            console.log('socket network RecvACK         :'+JSON.stringify(perf.pktRecvACK));
	            console.log('socket network RecvNACK        :'+JSON.stringify(perf.pktRecvNAK));
	            console.log('socket network AvailRcvBuf     :'+JSON.stringify(perf.byteAvailRcvBuf));
	            console.log('socket network AvailSndBuf     :'+JSON.stringify(perf.byteAvailSndBuf)+'\n\n');
            }
        }, 6000); // every 6s
        
        socket.on('close', function(){            
            clearInterval(intl);
            console.log('socket closed');
        });
        socket.on('error', function(){            
            clearInterval(intl);
            console.log('socket error');
        });
        socket.on('end', function(){            
            clearInterval(intl);
            console.log('socket end');
        });
    });
        
    console.log('please access URL: http://iwebpp.com:51688'+nmcln.vpath);
});
