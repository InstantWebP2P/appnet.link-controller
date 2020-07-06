### Data model as Graph

* GraphDB(Neo4j or OrientDB) used to describe live connection topology, use [Neo4j 2.1.8](https://github.com/neo4j/neo4j/releases/tag/2.1.8) for now.

    graphDB used to record SDP, establish peer connection's topology:
    1. SDP record will be mapped to client-node, server-node and their relationship;
    2. client-node represents User entity, server-node is nameserver entity;
    3. the relationship describe the session between user and name server;
    4. server-node was identified by nameserver IP&Port;
    5. client-node was identified by it's local IP&Port&devkey;
     5.1 device-node was identified by it's devkey;
    6. user-node was identified by User's domain+usrkey;
    7. multiple sessions can co-exist between nameserver and User entity;
    8. session consists of (nameserver ip&port)+(Users's domain+usrkey)+(nameclient local ip&port)+(devkey),
       that means one user can login to nameserver from different devices;
    9. router-node was identified by it's public IP&Port;
   10. using traceroute to setup the multi-hop route info between server-node and client-node;
   11. user can login to multiple clients, while a client means a device with local proto/ip/port;

