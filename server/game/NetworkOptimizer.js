// server/game/NetworkOptimizer.js
class NetworkOptimizer {
  constructor() {
    this.updateQueues = new Map(); // player -> priority queue
    this.lastFullState = new Map(); // player-viewer -> last state
    this.tickCounters = new Map(); // viewer -> tick count
    this.compressionEnabled = true;
    this.adaptiveTickrateEnabled = true;
    
    // Konfiguracja priorytetów
    this.priorities = {
      SELF: 4,      // Własny gracz
      COMBAT: 3,    // Gracz w walce
      NEAR: 2,      // Blisko
      MEDIUM: 1,    // Średnio daleko
      FAR: 0        // Daleko
    };
    
    // Konfiguracja tickrate
    this.tickRates = {
      SELF: 60,     // 60 FPS
      COMBAT: 60,   // 60 FPS
      NEAR: 60,     // 60 FPS
      MEDIUM: 30,   // 30 FPS
      FAR: 15       // 15 FPS
    };
  }
  
  // Oblicz priorytet dla pary gracz-widz
  calculatePriority(player, viewer, distance) {
    // Własny gracz zawsze najwyższy priorytet
    if (player.address === viewer.address) {
      return 'SELF';
    }
    
    // Sprawdź czy gracze są w walce (dotykają się)
    if (this.areInCombat(player, viewer)) {
      return 'COMBAT';
    }
    
    // Priorytet na podstawie odległości
    if (distance < 500) return 'NEAR';
    if (distance < 1000) return 'MEDIUM';
    return 'FAR';
  }
  
  // Sprawdź czy gracze są w walce
  areInCombat(player1, player2) {
    // Sprawdź każdą parę kulek
    for (const cell1 of player1.cells) {
      for (const cell2 of player2.cells) {
        const dx = cell2.x - cell1.x;
        const dy = cell2.y - cell1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Jeśli kulki się dotykają lub prawie dotykają
        if (distance < (cell1.radius + cell2.radius) * 1.2) {
          return true;
        }
      }
    }
    return false;
  }
  
  // Pobierz tickrate dla danego priorytetu
  getTickRate(priority) {
    return this.tickRates[priority] || 15;
  }
  
  // Sprawdź czy należy wysłać update
  shouldSendUpdate(viewerId, priority) {
    if (!this.adaptiveTickrateEnabled) return true;
    
    const key = `${viewerId}_${priority}`;
    const tickCount = this.tickCounters.get(key) || 0;
    const tickRate = this.getTickRate(priority);
    const skipFrames = Math.floor(60 / tickRate);
    
    // Zwiększ licznik
    this.tickCounters.set(key, tickCount + 1);
    
    // Czy wysłać w tej klatce?
    return tickCount % skipFrames === 0;
  }
  
  // Przygotuj dane do wysłania
  preparePlayerData(player, viewer, distance, priority) {
    const viewerId = viewer.address;
    const playerId = player.address;
    const stateKey = `${playerId}_${viewerId}`;
    
    // Sprawdź czy wysłać update
    if (!this.shouldSendUpdate(viewerId, priority)) {
      return null;
    }
    
    // Przygotuj dane gracza
    const currentState = {
      id: player.address,
      nickname: player.nickname,
      color: player.color,
      isMe: player.address === viewer.address,
      solValue: player.solValue,
      solDisplay: (player.solValue / 1000000000).toFixed(4),
      zone: player.currentZone,
      cells: player.cells.map(cell => ({
        id: cell.id,
        x: Math.round(cell.x * 10) / 10, // Zaokrąglij do 0.1
        y: Math.round(cell.y * 10) / 10,
        radius: Math.round(cell.radius),
        mass: Math.round(cell.mass)
      }))
    };
    
    // Kompresja delta dla odległych graczy
    if (this.compressionEnabled && priority === 'FAR') {
      const lastState = this.lastFullState.get(stateKey);
      
      if (lastState && this.canUseDelta(lastState, currentState)) {
        // Wyślij tylko deltę
        const delta = this.createDelta(lastState, currentState);
        return { type: 'delta', id: player.address, delta };
      }
    }
    
    // Zapisz pełny stan
    this.lastFullState.set(stateKey, currentState);
    return { type: 'full', data: currentState };
  }
  
  // Sprawdź czy można użyć delty
  canUseDelta(lastState, currentState) {
    // Nie używaj delty jeśli zmienił się liczba kulek
    if (lastState.cells.length !== currentState.cells.length) {
      return false;
    }
    
    // Nie używaj delty jeśli zmiana jest zbyt duża
    for (let i = 0; i < currentState.cells.length; i++) {
      const oldCell = lastState.cells[i];
      const newCell = currentState.cells[i];
      
      const dx = Math.abs(newCell.x - oldCell.x);
      const dy = Math.abs(newCell.y - oldCell.y);
      
      // Jeśli przesunięcie > 100 jednostek, wyślij pełny stan
      if (dx > 100 || dy > 100) {
        return false;
      }
    }
    
    return true;
  }
  
  // Stwórz deltę
  createDelta(lastState, currentState) {
    const delta = {
      cells: []
    };
    
    // Dodaj tylko zmienione wartości
    for (let i = 0; i < currentState.cells.length; i++) {
      const oldCell = lastState.cells[i];
      const newCell = currentState.cells[i];
      
      const cellDelta = { i }; // indeks
      
      if (oldCell.x !== newCell.x) cellDelta.x = newCell.x;
      if (oldCell.y !== newCell.y) cellDelta.y = newCell.y;
      if (oldCell.radius !== newCell.radius) cellDelta.r = newCell.radius;
      if (oldCell.mass !== newCell.mass) cellDelta.m = newCell.mass;
      
      if (Object.keys(cellDelta).length > 1) {
        delta.cells.push(cellDelta);
      }
    }
    
    // Dodaj zmienione wartości gracza
    if (lastState.solValue !== currentState.solValue) {
      delta.sol = currentState.solValue;
      delta.solD = currentState.solDisplay;
    }
    
    return delta;
  }
  
  // Optymalizuj listę graczy do wysłania
  optimizePlayerList(viewer, allPlayers, viewRadius) {
    const optimizedList = [];
    const viewerCenter = viewer.getCenterPosition();
    
    // Posortuj graczy według odległości
    const playersWithDistance = allPlayers.map(player => {
      const playerCenter = player.getCenterPosition();
      const dx = playerCenter.x - viewerCenter.x;
      const dy = playerCenter.y - viewerCenter.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      return { player, distance };
    });
    
    playersWithDistance.sort((a, b) => a.distance - b.distance);
    
    // Przetwórz każdego gracza
    for (const { player, distance } of playersWithDistance) {
      // Pomiń graczy poza zasięgiem
      if (distance > viewRadius + player.getBiggestCell().radius) {
        continue;
      }
      
      const priority = this.calculatePriority(player, viewer, distance);
      const playerData = this.preparePlayerData(player, viewer, distance, priority);
      
      if (playerData) {
        optimizedList.push(playerData);
      }
    }
    
    return optimizedList;
  }
  
  // Czyść stare dane
  cleanup() {
    // Czyść stare stany co minutę
    const now = Date.now();
    const maxAge = 60000; // 1 minuta
    
    // Czyść liczniki ticków
    for (const [key, value] of this.tickCounters) {
      if (value > 1000) {
        this.tickCounters.set(key, 0);
      }
    }
    
    // Ogranicz rozmiar cache
    if (this.lastFullState.size > 1000) {
      // Usuń najstarsze wpisy
      const entries = Array.from(this.lastFullState.entries());
      const toRemove = entries.slice(0, entries.length - 500);
      
      for (const [key] of toRemove) {
        this.lastFullState.delete(key);
      }
    }
  }
  
  // Pobierz statystyki
  getStats() {
    return {
      cacheSize: this.lastFullState.size,
      tickCounters: this.tickCounters.size,
      compressionEnabled: this.compressionEnabled,
      adaptiveTickrateEnabled: this.adaptiveTickrateEnabled
    };
  }
}

module.exports = NetworkOptimizer;