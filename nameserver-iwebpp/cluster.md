iwebpp.io-nameserver cluster - a cluster of machine node run nameserver services
============================================================================


## Goals

* distributed
* p2p, no single point of failure
* node can be added or removed dynamically
* auto load balancing
* secure connection between nodes
* dead node auto repair


## Design

* every node can run alonely, or join a cluster 
* any node can be plain node, or Seed node
* when node join cluster, need describe one or more Seed nodes in config
* Seed node used to node retrieve cluster state info when bootup
* 


## Architecture

* Seed node vs Plain node

  plain -> seed
  
* connected each other, in case node A, B, C

  A <-> B, B <-> C, C <-> A
  
* ping-poing detect peer node live status

  A ping to B, B ping to A, etc
  
* exchange cluster state information

  A report it's vURL info to B, B report it's vURL info to A, etc

* forward SEP message to correct node

  client a belong node A, client b belong node B, when a want to 
  talk to b, node A must forward get a's request to node B, then 
  node B take action on client b.

## Implementation

* front load-balancer detect dead node, distribute load from iwebpp.io client

* connected via SWS(secure websocket)


## Copyright reserved by tom zhou,iwebpp@gmail.com
