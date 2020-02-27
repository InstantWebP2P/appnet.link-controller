var sys = require('sys');

// websocket server
var wss = require('websocket-server/lib/ws/server');

var server = wss.createServer({debug: true});

// Handle WebSocket Requests
server.addListener("connection", function(conn){
  conn.send("Connection: "+conn.id);

  conn.addListener("message", function(message){
    conn.send("<"+conn.id+"> "+message);
    
    if(message == "error"){
      conn.emit("error", "test");
    }
  });
});

server.addListener("error", function(){
  console.log(Array.prototype.join.call(arguments, ", "));
});

server.addListener("disconnected", function(conn){
  server.broadcast("<"+conn.id+"> disconnected");
});

server.listen(8000);
