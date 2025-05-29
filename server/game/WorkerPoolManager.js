// server/game/WorkerPoolManager.js
const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');

class WorkerPoolManager {
  constructor(gameEngine) {
    this.gameEngine = gameEngine;
    this.workers = new Map(); // zoneId -> worker
    this.numWorkers = Math.min(4, os.cpus().length); // Max 4 workery (po 1 na strefę)
    this.messageQueue = new Map(); // workerId -> messages[]
    this.isRunning = false;
  }
  
  async start() {
    console.log(`Starting ${this.numWorkers} physics workers...`);
    
    // Utwórz worker dla każdej strefy
    for (let zoneId = 1; zoneId <= this.numWorkers; zoneId++) {
      await this.createWorker(zoneId);
    }
    
    this.isRunning = true;
    
    // Rozpocznij synchronizację danych
    this.startDataSync();
  }
  
  async createWorker(zoneId) {
    const workerPath = path.join(__dirname, '../workers/physicsWorker.js');
    
    const worker = new Worker(workerPath, {
      workerData: {
        zoneId,
        mapSize: this.gameEngine.mapSize,
        zoneSize: this.gameEngine.zoneSize,
        tickRate: 60
      }
    });
    
    // Obsługa wiadomości od workera
    worker.on('message', (msg) => {
      this.handleWorkerMessage(zoneId, msg);
    });
    
    worker.on('error', (err) => {
      console.error(`Worker ${zoneId} error:`, err);
      // Restartuj worker w przypadku błędu
      this.restartWorker(zoneId);
    });
    
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker ${zoneId} stopped with exit code ${code}`);
        this.restartWorker(zoneId);
      }
    });
    
    this.workers.set(zoneId, worker);
    console.log(`Physics worker ${zoneId} started`);
  }
  
  handleWorkerMessage(zoneId, msg) {
    switch(msg.type) {
      case 'PHYSICS_UPDATE':
        this.applyPhysicsUpdate(zoneId, msg.data);
        break;
      case 'DEBUG':
        console.log(`[Worker ${zoneId}]`, msg.data);
        break;
    }
  }
  
  applyPhysicsUpdate(zoneId, updates) {
    // Aktualizuj pozycje graczy
    for (const playerUpdate of updates.players) {
      const player = this.gameEngine.players.get(playerUpdate.id);
      if (!player) continue;
      
      // Aktualizuj tylko graczy w tej strefie
      if (player.currentZone !== zoneId) continue;
      
      // Synchronizuj pozycje kulek
      for (const cellUpdate of playerUpdate.cells) {
        const cell = player.cells.find(c => c.id === cellUpdate.id);
        if (cell) {
          cell.x = cellUpdate.x;
          cell.y = cellUpdate.y;
          cell.mass = cellUpdate.mass;
          cell.radius = cellUpdate.radius;
        }
      }
    }
    
    // Obsługa zjedzenia jedzenia
    for (const eaten of updates.foodEaten) {
      const player = this.gameEngine.players.get(eaten.playerId);
      const cell = player?.cells.find(c => c.id === eaten.cellId);
      if (cell) {
        cell.mass += eaten.mass;
        cell.updateRadius();
      }
      this.gameEngine.food.delete(eaten.foodId);
    }
    
    // Obsługa kolizji graczy
    for (const collision of updates.collisions) {
      if (collision.overlap > 0.8) {
        // Przekaż do głównego silnika gry
        this.gameEngine.handlePlayerCollision(
          collision.eaterId,
          collision.eaterCellId,
          collision.eatenId,
          collision.eatenCellId
        );
      }
    }
  }
  
  startDataSync() {
    // Synchronizuj dane z workerami co klatkę
    setInterval(() => {
      for (const [zoneId, worker] of this.workers) {
        // Zbierz graczy w tej strefie
        const zonePlayers = Array.from(this.gameEngine.players.values())
          .filter(p => p.currentZone === zoneId && p.isAlive)
          .map(p => ({
            id: p.address,
            cells: p.cells.map(c => ({
              id: c.id,
              x: c.x,
              y: c.y,
              mass: c.mass,
              radius: c.radius,
              velocityX: c.velocityX || 0,
              velocityY: c.velocityY || 0
            })),
            targetX: p.targetX,
            targetY: p.targetY,
            isAlive: p.isAlive
          }));
        
        // Zbierz jedzenie w tej strefie
        const bounds = this.gameEngine.getZoneBounds(zoneId);
        const zoneFood = Array.from(this.gameEngine.food.values())
          .filter(f => {
            return f.x >= bounds.minX && f.x <= bounds.maxX &&
                   f.y >= bounds.minY && f.y <= bounds.maxY;
          })
          .map(f => ({
            id: f.id,
            x: f.x,
            y: f.y,
            mass: f.mass,
            radius: f.radius
          }));
        
        // Wyślij dane do workera
        worker.postMessage({
          type: 'UPDATE_PLAYERS',
          data: zonePlayers
        });
        
        worker.postMessage({
          type: 'UPDATE_FOOD',
          data: zoneFood
        });
      }
    }, 16); // 60 FPS
  }
  
  sendPlayerInput(playerAddress, input) {
    const player = this.gameEngine.players.get(playerAddress);
    if (!player || !player.isAlive) return;
    
    const worker = this.workers.get(player.currentZone);
    if (worker) {
      worker.postMessage({
        type: 'PLAYER_INPUT',
        data: {
          playerId: playerAddress,
          input: input
        }
      });
    }
  }
  
  async restartWorker(zoneId) {
    console.log(`Restarting worker ${zoneId}...`);
    
    const oldWorker = this.workers.get(zoneId);
    if (oldWorker) {
      oldWorker.terminate();
    }
    
    await this.createWorker(zoneId);
  }
  
  stop() {
    this.isRunning = false;
    
    // Zakończ wszystkie workery
    for (const [zoneId, worker] of this.workers) {
      worker.terminate();
    }
    
    this.workers.clear();
    console.log('All physics workers stopped');
  }
  
  getStats() {
    const stats = {
      workers: this.workers.size,
      running: this.isRunning,
      workerStats: []
    };
    
    for (const [zoneId, worker] of this.workers) {
      stats.workerStats.push({
        zoneId,
        threadId: worker.threadId
      });
    }
    
    return stats;
  }
}

module.exports = WorkerPoolManager;