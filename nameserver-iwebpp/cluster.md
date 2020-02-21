iwebpp.io-nameserver cluster - a cluster of machine node run nameserver services
============================================================================


## Goals

* distributed
* p2p, no single point of failure
* node can join or leave dynamically
* auto load balancing
* secure connection between nodes
* dead node auto repair,removed,refresh


## Design

* every node can run alonely, or join a cluster as constant hash ring
* any node can be plain node, or Seed node
* when node join cluster, need describe one or more Seed nodes to connect
* Seed node used for plain node retrieve cluster state info when bootup
* every node exchange cluster state info automatically, including cluster toponology and vURL/peerService information


## Architecture

* Seed node vs Plain node

  plain -> seed
  
* connected each other, in case node A, B, C

  A <-> B, B <-> C, C <-> A
  
* ping-poing detect peer node live status

  A ping to B, B ping to A, etc
  
* exchange cluster state information

  A report it's cluster toponology info to all peers, B so on,
  A report it's vURL/peerService info to B, B report it's vURL/peerService info to A, etc

* forward SEP message to correct node

  client a belong node A, client b belong node B;
  when a talk to b, node A must forward a's request to node B, then 
  node B take action on client b.

## Implementation

* front load-balancer detect dead node, distribute load from iwebpp.io client

* connected via SWS(secure websocket)

* node connection toponology

  root node A, second bootup node B, third node C, forth node D, like 
  A bootup without Seed node, 
  B bootup with A as Seed node, B get cluster state info from A, 
  then B setup connection to other peers, and get cluster state info again;
  C bootup with A or B as Seed node, like B, A get cluster state info from A or B,
  then B setup connecton to other peers, and get cluster state info again;
  
  After A,B,C bootup well and exchange cluster state info done, then they enter
  normal cluster state, that exchanges vURL/peerService info in real time.
  
  If some node leave cluser or dead, Node will exhange cluster state info again until
  maintain a consistent cluster toponology.


## Copyright reserved by tom zhou,iwebpp@gmail.com
