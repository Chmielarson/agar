// src/components/WebRTCManager.js
export default class WebRTCManager {
  constructor(socket, playerAddress) {
    this.socket = socket;
    this.playerAddress = playerAddress;
    this.peers = new Map(); // socketId -> RTCPeerConnection
    this.dataChannels = new Map(); // socketId -> RTCDataChannel
    this.currentZone = null;
    
    this.setupSocketListeners();
  }
  
  setupSocketListeners() {
    // Lista peerów w strefie
    this.socket.on('zone_peers', async (data) => {
      console.log('Otrzymano listę peerów w strefie:', data);
      
      // Połącz się z każdym peerem
      for (const peer of data.peers) {
        await this.createPeerConnection(peer.socketId, true);
      }
    });
    
    // Nowy peer dołączył
    this.socket.on('peer_joined', async (data) => {
      console.log('Nowy peer dołączył:', data.peer);
      await this.createPeerConnection(data.peer.socketId, false);
    });
    
    // Peer opuścił
    this.socket.on('peer_left', (data) => {
      console.log('Peer opuścił:', data);
      this.removePeerConnection(data.socketId);
    });
    
    // WebRTC signaling
    this.socket.on('webrtc_offer', async (data) => {
      console.log('Otrzymano ofertę WebRTC od:', data.senderSocketId);
      await this.handleOffer(data);
    });
    
    this.socket.on('webrtc_answer', async (data) => {
      console.log('Otrzymano odpowiedź WebRTC od:', data.senderSocketId);
      await this.handleAnswer(data);
    });
    
    this.socket.on('webrtc_ice_candidate', async (data) => {
      await this.handleIceCandidate(data);
    });
  }
  
  async joinZone(zoneId) {
    console.log(`Dołączam do P2P strefy ${zoneId}`);
    
    // Opuść poprzednią strefę
    if (this.currentZone && this.currentZone !== zoneId) {
      this.leaveZone();
    }
    
    this.currentZone = zoneId;
    
    // Dołącz do nowej strefy
    this.socket.emit('join_zone_p2p', {
      playerAddress: this.playerAddress,
      zoneId: zoneId
    });
  }
  
  leaveZone() {
    if (!this.currentZone) return;
    
    console.log(`Opuszczam P2P strefę ${this.currentZone}`);
    
    // Zamknij wszystkie połączenia
    for (const [socketId, pc] of this.peers) {
      this.removePeerConnection(socketId);
    }
    
    this.socket.emit('leave_zone_p2p');
    this.currentZone = null;
  }
  
  async createPeerConnection(remoteSocketId, createOffer) {
    console.log(`Tworzę połączenie P2P z ${remoteSocketId}`);
    
    // Konfiguracja STUN/TURN
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Dodaj swój TURN server jeśli masz
      ]
    };
    
    const pc = new RTCPeerConnection(configuration);
    this.peers.set(remoteSocketId, pc);
    
    // Obsługa ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc_ice_candidate', {
          targetSocketId: remoteSocketId,
          candidate: event.candidate
        });
      }
    };
    
    // Utwórz data channel
    const dataChannel = pc.createDataChannel('gameData', {
      ordered: false, // Nie gwarantuj kolejności dla lepszej wydajności
      maxRetransmits: 0 // Nie retransmituj dla niskiego opóźnienia
    });
    
    dataChannel.onopen = () => {
      console.log(`Data channel otwarty z ${remoteSocketId}`);
      this.dataChannels.set(remoteSocketId, dataChannel);
    };
    
    dataChannel.onmessage = (event) => {
      this.handleDataChannelMessage(remoteSocketId, event.data);
    };
    
    dataChannel.onclose = () => {
      console.log(`Data channel zamknięty z ${remoteSocketId}`);
      this.dataChannels.delete(remoteSocketId);
    };
    
    // Obsługa przychodzącego data channel
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      channel.onopen = () => {
        console.log(`Przychodzący data channel otwarty z ${remoteSocketId}`);
        this.dataChannels.set(remoteSocketId, channel);
      };
      
      channel.onmessage = (event) => {
        this.handleDataChannelMessage(remoteSocketId, event.data);
      };
    };
    
    // Utwórz ofertę jeśli jesteśmy inicjatorem
    if (createOffer) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        this.socket.emit('webrtc_offer', {
          targetSocketId: remoteSocketId,
          offer: offer
        });
      } catch (error) {
        console.error('Błąd tworzenia oferty:', error);
      }
    }
  }
  
  async handleOffer(data) {
    const { senderSocketId, offer } = data;
    
    // Utwórz połączenie jeśli nie istnieje
    if (!this.peers.has(senderSocketId)) {
      await this.createPeerConnection(senderSocketId, false);
    }
    
    const pc = this.peers.get(senderSocketId);
    if (!pc) return;
    
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      this.socket.emit('webrtc_answer', {
        targetSocketId: senderSocketId,
        answer: answer
      });
    } catch (error) {
      console.error('Błąd obsługi oferty:', error);
    }
  }
  
  async handleAnswer(data) {
    const { senderSocketId, answer } = data;
    const pc = this.peers.get(senderSocketId);
    
    if (!pc) return;
    
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error('Błąd obsługi odpowiedzi:', error);
    }
  }
  
  async handleIceCandidate(data) {
    const { senderSocketId, candidate } = data;
    const pc = this.peers.get(senderSocketId);
    
    if (!pc) return;
    
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Błąd dodawania ICE candidate:', error);
    }
  }
  
  removePeerConnection(socketId) {
    const pc = this.peers.get(socketId);
    if (pc) {
      pc.close();
      this.peers.delete(socketId);
    }
    
    const dc = this.dataChannels.get(socketId);
    if (dc) {
      dc.close();
      this.dataChannels.delete(socketId);
    }
  }
  
  // Wysyłanie danych do peerów
  broadcastPlayerPosition(position) {
    const data = JSON.stringify({
      type: 'position',
      playerAddress: this.playerAddress,
      position: position,
      timestamp: Date.now()
    });
    
    for (const [socketId, channel] of this.dataChannels) {
      if (channel.readyState === 'open') {
        try {
          channel.send(data);
        } catch (error) {
          console.error(`Błąd wysyłania do ${socketId}:`, error);
        }
      }
    }
  }
  
  // Odbieranie danych od peerów
  handleDataChannelMessage(senderSocketId, data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'position':
          // Aktualizuj pozycję gracza lokalnie
          if (this.onPlayerPositionUpdate) {
            this.onPlayerPositionUpdate(message.playerAddress, message.position);
          }
          break;
        case 'action':
          // Obsługa akcji gracza (split, eject)
          if (this.onPlayerAction) {
            this.onPlayerAction(message.playerAddress, message.action);
          }
          break;
      }
    } catch (error) {
      console.error('Błąd parsowania wiadomości:', error);
    }
  }
  
  // Callback dla aktualizacji pozycji
  onPlayerPositionUpdate = null;
  onPlayerAction = null;
  
  getStats() {
    return {
      currentZone: this.currentZone,
      connectedPeers: this.peers.size,
      activeDataChannels: Array.from(this.dataChannels.values())
        .filter(dc => dc.readyState === 'open').length
    };
  }
  
  destroy() {
    this.leaveZone();
    this.socket.off('zone_peers');
    this.socket.off('peer_joined');
    this.socket.off('peer_left');
    this.socket.off('webrtc_offer');
    this.socket.off('webrtc_answer');
    this.socket.off('webrtc_ice_candidate');
  }
}