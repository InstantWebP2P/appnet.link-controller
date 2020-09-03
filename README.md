# appnet.link-controller
AppNet.Link controller services to support [AppNet.link protocol](https://github.com/InstantWebP2P/appnet.link)


### Prerequest

* Build Neo4j 2.1.8 on Linux with Docker, then start Neo4j services

      ./neo4jpkg

* Copy Neo4j packages out of Docker image to local

      ./neo4jpkg cp -rf /tmp/*.tar* .

 
### Install

* appnet.link-controller depends on nodejs-httpp, please build it from [nodejs-httpp](https://github.com/InstantWebP2P/nodejs-httpp.git)

* clone this repo and install dependency modules

      npm i

* generate SSL certs once for your own Domain Name, like

    ` ./tools/genSrvKey.bash 51dese.com `

* start controller services

    ` ~/nodejs-httpp/node ./bin/srv.js `

* now ready to serve [appnet.link client](https://github.com/InstantWebP2P/appnet.link)


#### Install on Linux with Docker

* Build nodejs-httpp docker images, refer to [nodejs-httpp](https://github.com/InstantWebP2P/nodejs-httpp)

* Clone this repo

* Install dependency modules

      ./appbld npm i
      
* Generate SSL certs once for your own Domain Name, like

      ./appbld ./tools/genSrvKey.bash 51dese.com
      
* Packaging and start services
      
      ./apppkg 

      Start services ...
      name-server-0 listen on udp port 51686
      name-server-1 listen on udp port 51868
      agent-server listen on udp port 51866
      httpp proxy-server listen on udp port 51688
      http proxy-server listen on tcp port 51688

* Testing service if start successfully

      ./apppkg node tests/connection.js 
  
      node tests/connection.js ...
      connecting to alternative name-server successfully
      connecting to primary name-server successfully


### Code structure

```js

* sdp.js                 - Session Desription implementation
* stun.js                - STUN protcol implementation
* turn.js                - TURN protocl implementation
* db/sdp.js.             - Session data model persistent in GraphDB
* vurl.js.               - Virtual URL implementation

* appnet.link-server.js    - AppNet.link protocol controller implementation
* appnet.link-server-v2.js - AppNet.link protocol controller V2 implementation using SecureWebsocket and NaclCert

* ssl.js                 - SSL/RSA certs generate utils
* demos/                 - demos
* ca-certs               - your own Root CA certs
* certs                  - dynamical generated SSL/RSA certs for connections
* routepath.js           - pure JS tracerouter implementation using UDP/TTL probe. TBD

```
    
### More demos:

    Look on demos/


### TODO:

* User authentication
* Domain authorization
* Improve documents, Protocol Spec, RFC draft
* Cluster implementation based on [Raft](https://raft.github.io/) consensus protocol


### Support us

* Welcome contributing on document, codes, tests and issues


### License

(The MIT License)

Copyright (c) 2012-present Tom Zhou(appnet.link@gmail.com)
