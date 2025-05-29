// server/webrtc/webrtcSignaling.js
class WebRTCSignaling {
  constructor(io) {
    this.io = io;
    this.peers = new Map(); // socketId -> peerInfo
    this.rooms = new Map(); // zoneId -> Set<socketId>
    
    this.setupSignaling();
  }
  
  setupSignaling() {
    this.io.on('connection', (socket) => {
      // WebRTC Signaling Events
      
      socket.on('join_zone_p2p', (data) => {
        const { playerAddress, zoneId } = data;
        
        // Dodaj do pokoju strefy
        const roomName = `zone_${zoneId}`;
        socket.join(roomName);
        
        // Zapisz info o peerze
        this.peers.set(socket.id, {
          playerAddress,
          zoneId,
          socketId: socket.id
        });
        
        // Dodaj do listy peerów w strefie
        if (!this.rooms.has(zoneId)) {
          this.rooms.set(zoneId, new Set());
        }
        this.rooms.get(zoneId).add(socket.id);
        
        // Powiadom innych o nowym peerze
        const otherPeers = Array.from(this.rooms.get(zoneId))
          .filter(id => id !== socket.id)
          .map(id => this.peers.get(id));
        
        socket.emit('zone_peers', {
          peers: otherPeers,
          zoneId
        });
        
        // Powiadom innych że dołączył nowy peer
        socket.to(roomName).emit('peer_joined', {
          peer: this.peers.get(socket.id)
        });
        
        console.log(`Player ${playerAddress} joined P2P zone ${zoneId}`);
      });
      
      socket.on('webrtc_offer', (data) => {
        const { targetSocketId, offer } = data;
        const sender = this.peers.get(socket.id);
        
        if (!sender) return;
        
        // Przekaż ofertę do docelowego peera
        this.io.to(targetSocketId).emit('webrtc_offer', {
          offer,
          senderSocketId: socket.id,
          senderAddress: sender.playerAddress
        });
      });
      
      socket.on('webrtc_answer', (data) => {
        const { targetSocketId, answer } = data;
        const sender = this.peers.get(socket.id);
        
        if (!sender) return;
        
        // Przekaż odpowiedź
        this.io.to(targetSocketId).emit('webrtc_answer', {
          answer,
          senderSocketId: socket.id,
          senderAddress: sender.playerAddress
        });
      });
      
      socket.on('webrtc_ice_candidate', (data) => {
        const { targetSocketId, candidate } = data;
        
        // Przekaż kandydata ICE
        this.io.to(targetSocketId).emit('webrtc_ice_candidate', {
          candidate,
          senderSocketId: socket.id
        });
      });
      
      socket.on('leave_zone_p2p', () => {
        this.removePeer(socket.id);
      });
      
      socket.on('disconnect', () => {
        this.removePeer(socket.id);
      });
    });
  }
  
  removePeer(socketId) {
    const peer = this.peers.get(socketId);
    if (!peer) return;
    
    const { zoneId } = peer;
    const roomName = `zone_${zoneId}`;
    
    // Usuń z pokoju
    this.io.sockets.sockets.get(socketId)?.leave(roomName);
    
    // Usuń z listy peerów
    this.peers.delete(socketId);
    
    // Usuń z listy strefy
    const zonePeers = this.rooms.get(zoneId);
    if (zonePeers) {
      zonePeers.delete(socketId);
      if (zonePeers.size === 0) {
        this.rooms.delete(zoneId);
      }
    }
    
    // Powiadom innych o rozłączeniu
    this.io.to(roomName).emit('peer_left', {
      socketId,
      playerAddress: peer.playerAddress
    });
    
    console.log(`Peer ${peer.playerAddress} left zone ${zoneId}`);
  }
  
  getStats() {
    const stats = {
      totalPeers: this.peers.size,
      zones: {}
    };
    
    for (const [zoneId, peers] of this.rooms) {
      stats.zones[zoneId] = {
        peerCount: peers.size,
        peers: Array.from(peers).map(id => {
          const peer = this.peers.get(id);
          return peer ? peer.playerAddress : 'unknown';
        })
      };
    }
    
    return stats;
  }
}

module.exports = WebRTCSignaling;