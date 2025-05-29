// server/workers/physicsWorker.js
const { parentPort, workerData } = require('worker_threads');

class PhysicsWorker {
  constructor() {
    this.players = new Map();
    this.food = new Map();
    this.mapSize = workerData.mapSize || 10000;
    this.tickRate = workerData.tickRate || 60;
    this.lastUpdate = Date.now();
  }

  start() {
    console.log(`Physics worker started for zone ${workerData.zoneId}`);
    
    // Nasłuchuj na wiadomości z głównego wątku
    parentPort.on('message', (msg) => {
      switch(msg.type) {
        case 'UPDATE_PLAYERS':
          this.updatePlayers(msg.data);
          break;
        case 'UPDATE_FOOD':
          this.updateFood(msg.data);
          break;
        case 'PLAYER_INPUT':
          this.handlePlayerInput(msg.data);
          break;
        case 'TICK':
          this.physicsTick();
          break;
      }
    });
    
    // Rozpocznij pętlę fizyki
    this.startPhysicsLoop();
  }
  
  startPhysicsLoop() {
    setInterval(() => {
      this.physicsTick();
    }, 1000 / this.tickRate);
  }
  
  physicsTick() {
    const now = Date.now();
    const deltaTime = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;
    
    const updates = {
      players: [],
      collisions: [],
      foodEaten: []
    };
    
    // Aktualizuj pozycje graczy
    for (const [playerId, player] of this.players) {
      if (!player.isAlive) continue;
      
      // Oblicz ruch każdej kulki
      player.cells.forEach(cell => {
        // Kierunek do celu
        const dx = player.targetX - cell.x;
        const dy = player.targetY - cell.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 1) {
          const dirX = dx / distance;
          const dirY = dy / distance;
          
          // Prędkość zależy od masy
          const baseSpeed = 3;
          let speed = baseSpeed * (30 / (Math.sqrt(cell.mass) + 20));
          speed = Math.max(speed, baseSpeed * 0.3);
          
          // Aktualizuj prędkość
          cell.velocityX += dirX * speed * 2;
          cell.velocityY += dirY * speed * 2;
          
          // Ogranicz maksymalną prędkość
          const maxSpeed = speed * 60;
          const currentSpeed = Math.sqrt(cell.velocityX * cell.velocityX + cell.velocityY * cell.velocityY);
          if (currentSpeed > maxSpeed) {
            cell.velocityX = (cell.velocityX / currentSpeed) * maxSpeed;
            cell.velocityY = (cell.velocityY / currentSpeed) * maxSpeed;
          }
        }
        
        // Zastosuj prędkość
        cell.x += cell.velocityX * deltaTime;
        cell.y += cell.velocityY * deltaTime;
        
        // Tłumienie
        const friction = 0.94;
        cell.velocityX *= friction;
        cell.velocityY *= friction;
        
        // Granice mapy
        const margin = cell.radius * 0.3;
        cell.x = Math.max(-margin, Math.min(this.mapSize + margin, cell.x));
        cell.y = Math.max(-margin, Math.min(this.mapSize + margin, cell.y));
        
        // Utrata masy
        if (cell.mass > 20) {
          cell.mass *= (1 - 0.002 * deltaTime);
        }
      });
      
      updates.players.push({
        id: playerId,
        cells: player.cells.map(c => ({
          id: c.id,
          x: c.x,
          y: c.y,
          mass: c.mass,
          radius: Math.sqrt(c.mass / Math.PI) * 5
        }))
      });
    }
    
    // Sprawdź kolizje gracz-jedzenie
    for (const [playerId, player] of this.players) {
      if (!player.isAlive) continue;
      
      for (const [foodId, food] of this.food) {
        for (const cell of player.cells) {
          const dx = food.x - cell.x;
          const dy = food.y - cell.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < cell.radius && cell.radius > food.radius) {
            updates.foodEaten.push({
              playerId,
              cellId: cell.id,
              foodId,
              mass: food.mass
            });
            this.food.delete(foodId);
            break;
          }
        }
      }
    }
    
    // Sprawdź kolizje gracz-gracz
    const playerArray = Array.from(this.players.values()).filter(p => p.isAlive);
    
    for (let i = 0; i < playerArray.length; i++) {
      for (let j = i + 1; j < playerArray.length; j++) {
        const player1 = playerArray[i];
        const player2 = playerArray[j];
        
        for (const cell1 of player1.cells) {
          for (const cell2 of player2.cells) {
            const dx = cell2.x - cell1.x;
            const dy = cell2.y - cell1.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < cell1.radius + cell2.radius) {
              // Sprawdź kto może zjeść kogo
              if (cell1.radius > cell2.radius * 1.1) {
                updates.collisions.push({
                  eaterId: player1.id,
                  eaterCellId: cell1.id,
                  eatenId: player2.id,
                  eatenCellId: cell2.id,
                  overlap: this.calculateOverlap(cell1, cell2, distance)
                });
              } else if (cell2.radius > cell1.radius * 1.1) {
                updates.collisions.push({
                  eaterId: player2.id,
                  eaterCellId: cell2.id,
                  eatenId: player1.id,
                  eatenCellId: cell1.id,
                  overlap: this.calculateOverlap(cell2, cell1, distance)
                });
              }
            }
          }
        }
      }
    }
    
    // Wyślij aktualizacje do głównego wątku
    parentPort.postMessage({
      type: 'PHYSICS_UPDATE',
      data: updates
    });
  }
  
  calculateOverlap(biggerCell, smallerCell, distance) {
    const overlap = biggerCell.radius + smallerCell.radius - distance;
    const overlapRatio = overlap / (smallerCell.radius * 2);
    return Math.min(1, overlapRatio);
  }
  
  updatePlayers(playersData) {
    // Aktualizuj dane graczy z głównego wątku
    for (const playerData of playersData) {
      this.players.set(playerData.id, playerData);
    }
  }
  
  updateFood(foodData) {
    // Aktualizuj dane jedzenia
    for (const food of foodData) {
      this.food.set(food.id, food);
    }
  }
  
  handlePlayerInput(data) {
    const player = this.players.get(data.playerId);
    if (!player) return;
    
    player.targetX = data.input.mouseX;
    player.targetY = data.input.mouseY;
    
    // Obsługa podziału i wyrzucania masy będzie w głównym wątku
  }
}

// Uruchom worker
const worker = new PhysicsWorker();
worker.start();