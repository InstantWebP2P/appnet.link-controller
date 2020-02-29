# iwebpp.io-controller
iWebPP.IO controller serivices to support [iwebpp.io protocol](https://github.com/InstantWebP2P/iwebpp.io)


### [Discussion group](https://groups.google.com/d/forum/iwebpp)


### Prerequest

* install Neo4j graphDB, then start Neo4j service. refer to [Running Neo4j](https://github.com/neo4j/neo4j)

    ` bin/neo4j start `
 
### Install/Usage

* iwebpp.io-controller depends on node-httpp, please build it from repo [node-httpp](https://github.com/InstantWebP2P/node-httpp.git)

* clone this repo and install dependency modules

      npm config set strict-ssl false -g
      npm i npm@3.10.10 -g    
      npm i

* generate SSL certs once for your own Domain Name

    ` ./tools/genSrvKey.bash aiworkspace.com `

* start controller services

    ` ~/node-httpp/node ./bin/srv.js `

* now ready to serve [iwebpp.io client](https://github.com/InstantWebP2P/iwebpp.io)


#### Install on Linux with Docker

* Build node-httpp docker images firstly. Refer to [node-httpp](https://github.com/InstantWebP2P/node-httpp)

* Clone this repo

* Install dependency modules

      ./appbld npm i
      
* Generate SSL certs

      ./appbld ./tools/genSrvKey.bash aiworkspace.com
      
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

* sdp.js                 - Session Desription implementation
* stun.js                - STUN protcol implementation
* turn.js                - TURN protocl implementation
* db/sdp.js.             - Session data model persistent in GraphDB
* vurl.js.               - Virtual URL implementation

* iwebpp.io-server.js    - iWebPP.io protocol controller implementation
* iwebpp.io-server-v2.js - iWebPP.io protocol controller V2 implementation using SecureWebsocket and NaclCert

* ssl.js                 - SSL/RSA certs generate utils
* demos/                 - demos
* ca-certs               - your own Root CA certs
* certs                  - dynamical generated SSL/RSA certs for connections
* routepath.js           - pure JS tracerouter implementation using UDP/TTL probe. TBD

    
### More demos:

    Look on demos/


### TODO:

* User authentication
* Domain authorization
* Improve documents, Protocol Spec, RFC draft


### Support us

* Welcome contributing on document, codes, tests and issues


### License

(The MIT License)

Copyright (c) 2012-present Tom Zhou(iwebpp@gmail.com)
