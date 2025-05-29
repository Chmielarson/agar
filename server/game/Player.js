// Pełna zaktualizowana klasa Player:
const Cell = require('./Cell');

class Player {
  constructor(address, x, y, nickname = null, initialStake = 0) {
    this.address = address;
    this.nickname = nickname || `Player ${address.substring(0, 6)}`;
    
    // Rozdzielenie masy i wartości SOL
    const stakeSol = initialStake / 1000000000; // Konwersja na SOL
    const initialMass = 20 + (stakeSol * 1000); // Bazowa masa 20 + 1000 per SOL
    
    // System wielu kulek
    this.cells = [
      new Cell(x, y, initialMass, address)
    ];
    this.maxCells = 4; // Maksymalnie 4 kulki
    
    this.solValue = initialStake; // Wartość w SOL (w lamports)
    this.initialStake = initialStake; // Ile gracz wniósł na start
    
    this.color = this.generateColor();
    this.isAlive = true;
    this.score = 0;
    
    // Informacje o strefie
    this.currentZone = 1; // Domyślnie strefa 1
    this.canAdvanceToZone = null; // Czy może awansować do wyższej strefy
    
    // Cel ruchu (dla wszystkich kulek)
    this.targetX = x;
    this.targetY = y;
    
    // Ograniczenia
    this.lastSplitTime = 0;
    this.lastEjectTime = 0;
    this.splitCooldown = 100; // 100ms między podziałami
    this.ejectCooldown = 100; // 100ms
    
    // Combat log
    this.lastCombatTime = 0;
    this.combatCooldown = 10000; // 10 sekund
    
    // Statystyki
    this.playersEaten = 0;
    this.totalSolEarned = 0;
    
    // Cash out status
    this.isCashingOut = false;
    
    console.log(`Player created: ${nickname} (${address}) with stake: ${initialStake} lamports (${stakeSol} SOL), starting mass: ${initialMass}`);
  }
  
  // Pobierz całkowitą masę gracza
  getTotalMass() {
    return this.cells.reduce((sum, cell) => sum + cell.mass, 0);
  }
  
  // Pobierz środek masy (dla kamery)
  getCenterPosition() {
    if (this.cells.length === 0) return { x: 0, y: 0 };
    
    let totalMass = 0;
    let centerX = 0;
    let centerY = 0;
    
    for (const cell of this.cells) {
      centerX += cell.x * cell.mass;
      centerY += cell.y * cell.mass;
      totalMass += cell.mass;
    }
    
    return {
      x: centerX / totalMass,
      y: centerY / totalMass
    };
  }
  
  // Pobierz największą kulkę
  getBiggestCell() {
    if (this.cells.length === 0) return null;
    return this.cells.reduce((biggest, cell) => 
      cell.mass > biggest.mass ? cell : biggest
    );
  }
  
  // NOWA METODA - Oblicz promień gracza
  calculateRadius() {
    const biggest = this.getBiggestCell();
    if (biggest) {
      return biggest.radius;
    }
    // Jeśli nie ma kulek, oblicz na podstawie masy
    const totalMass = this.getTotalMass();
    if (totalMass > 0) {
      return Math.sqrt(totalMass / Math.PI) * 5;
    }
    // Domyślny promień
    return Math.sqrt(20 / Math.PI) * 5;
  }
  
  // Oblicz promień gracza (dla kompatybilności)
  get radius() {
    return this.calculateRadius();
  }
  
  // Pozycja gracza (dla kompatybilności)
  get x() {
    const center = this.getCenterPosition();
    return center.x;
  }
  
  get y() {
    const center = this.getCenterPosition();
    return center.y;
  }
  
  // Masa gracza (dla kompatybilności)
  get mass() {
    return this.getTotalMass();
  }
  
  set mass(value) {
    // Gdy ustawiamy masę, rozdziel proporcjonalnie między kulki
    if (this.cells.length === 0) return;
    
    const totalMass = this.getTotalMass();
    if (totalMass === 0) return;
    
    const ratio = value / totalMass;
    
    for (const cell of this.cells) {
      cell.mass *= ratio;
      cell.updateRadius();
    }
  }
  
  generateColor() {
    const hue = Math.floor(Math.random() * 360);
    const saturation = Math.min(90, 50 + (this.solValue / 1000000000) * 40);
    return `hsl(${hue}, ${saturation}%, 50%)`;
  }
  
  updateColor() {
    const match = this.color.match(/hsl\((\d+),/);
    if (match) {
      const hue = parseInt(match[1]);
      const saturation = Math.min(90, 50 + (this.solValue / 1000000000) * 40);
      this.color = `hsl(${hue}, ${saturation}%, 50%)`;
    }
  }
  
  setTarget(x, y) {
    console.log(`Player ${this.address} target set to:`, x, y); // DEBUG
    this.targetX = x;
    this.targetY = y;
  }
  
  enterCombat() {
    this.lastCombatTime = Date.now();
    console.log(`Player ${this.address} entered combat, cash out locked for 10s`);
  }
  
  canCashOut() {
    if (!this.isAlive || this.isCashingOut) return false;
    
    const now = Date.now();
    const timeSinceCombat = now - this.lastCombatTime;
    return timeSinceCombat >= this.combatCooldown;
  }
  
  getCombatCooldownRemaining() {
    const now = Date.now();
    const timeSinceCombat = now - this.lastCombatTime;
    
    if (timeSinceCombat >= this.combatCooldown) {
      return 0;
    }
    
    return Math.ceil((this.combatCooldown - timeSinceCombat) / 1000);
  }
  
  update(deltaTime, mapSize) {
    if (!this.isAlive) return;
    
    // Aktualizuj każdą kulkę
    for (let i = this.cells.length - 1; i >= 0; i--) {
      const cell = this.cells[i];
      
      // Oblicz kierunek do celu dla tej kulki
      const dx = this.targetX - cell.x;
      const dy = this.targetY - cell.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 1) {
        // Normalizuj kierunek
        const dirX = dx / distance;
        const dirY = dy / distance;
        
        // Prędkość zależy od masy kulki
        const baseSpeed = 3;
        let speed = baseSpeed * (30 / (Math.sqrt(cell.mass) + 20));
        speed = Math.max(speed, baseSpeed * 0.3);
        
        // Dodaj siłę ruchu do prędkości
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
      
      // Aktualizuj pozycję kulki
      cell.update(deltaTime, mapSize);
    }
    
    // Sprawdź możliwość połączenia kulek
    this.tryMergeCells();
  }
  
  tryMergeCells() {
    if (this.cells.length <= 1) return;
    
    for (let i = 0; i < this.cells.length; i++) {
      for (let j = i + 1; j < this.cells.length; j++) {
        const cell1 = this.cells[i];
        const cell2 = this.cells[j];
        
        // Sprawdź dystans
        const dx = cell2.x - cell1.x;
        const dy = cell2.y - cell1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Jeśli kulki się stykają i mogą się połączyć
        if (distance < cell1.radius + cell2.radius && cell1.canMergeWith(cell2)) {
          // Połącz kulki
          cell1.mass += cell2.mass;
          cell1.updateRadius();
          
          // Ustaw pozycję na środek masy
          cell1.x = (cell1.x * cell1.mass + cell2.x * cell2.mass) / (cell1.mass + cell2.mass);
          cell1.y = (cell1.y * cell1.mass + cell2.y * cell2.mass) / (cell1.mass + cell2.mass);
          
          // Usuń drugą kulkę
          this.cells.splice(j, 1);
          j--;
          
          console.log(`Player ${this.address} merged cells. Now has ${this.cells.length} cells`);
        }
      }
    }
  }
  
  // Jedzenie zwykłego jedzenia
  eatFood(foodMass, cellIndex = null) {
    // Jeśli nie podano indeksu, znajdź najbliższą kulkę do jedzenia
    if (cellIndex !== null && cellIndex < this.cells.length) {
      this.cells[cellIndex].mass += foodMass;
      this.cells[cellIndex].updateRadius();
    } else if (this.cells.length > 0) {
      // Dodaj do największej kulki
      const biggest = this.getBiggestCell();
      if (biggest) {
        biggest.mass += foodMass;
        biggest.updateRadius();
      }
    }
    
    this.score += Math.floor(foodMass);
  }
  
  // Jedzenie gracza - TYLKO gdy zjada WSZYSTKIE jego kulki
  eatPlayer(otherPlayer) {
    // Dodaj masę wszystkich kulek zjedzonego gracza
    const totalEatenMass = otherPlayer.getTotalMass();
    
    // Znajdź która kulka zjadła (największa)
    const eaterCell = this.getBiggestCell();
    if (eaterCell) {
      eaterCell.mass += totalEatenMass;
      eaterCell.updateRadius();
    }
    
    // WAŻNE: Dodaj SOL tylko gdy gracz zostaje całkowicie wyeliminowany
    const gainedSol = otherPlayer.solValue;
    this.solValue += gainedSol;
    this.totalSolEarned += gainedSol;
    
    // Bonus masy za wartość SOL gracza
    const solBonus = (gainedSol / 1000000000) * 100;
    if (eaterCell) {
      eaterCell.mass += solBonus;
      eaterCell.updateRadius();
    }
    
    this.playersEaten++;
    this.score += Math.floor(totalEatenMass + solBonus);
    
    this.updateColor();
    
    console.log(`Player ${this.address} ate ${otherPlayer.address}. ` +
                `Gained ${gainedSol} lamports (${gainedSol/1000000000} SOL) and ${totalEatenMass + solBonus} mass. ` +
                `New total SOL value: ${this.solValue} lamports (${this.solValue/1000000000} SOL)`);
  }
  
  // Zjedzenie pojedynczej kulki innego gracza (NIE transferuje SOL!)
  eatEnemyCell(cell) {
    // Znajdź kulkę która zjadła
    const eaterCell = this.getBiggestCell();
    if (eaterCell) {
      eaterCell.mass += cell.mass;
      eaterCell.updateRadius();
    }
    
    this.score += Math.floor(cell.mass);
    
    console.log(`Player ${this.address} ate enemy cell with mass ${cell.mass}. No SOL transferred yet.`);
  }
  
  canSplit() {
    const now = Date.now();
    const biggestCell = this.getBiggestCell();
    return (
      this.cells.length < this.maxCells &&
      biggestCell && biggestCell.mass >= 35 && 
      now - this.lastSplitTime > this.splitCooldown
    );
  }
  
  canEject() {
    const now = Date.now();
    const biggestCell = this.getBiggestCell();
    return (
      biggestCell && biggestCell.mass >= 35 && 
      now - this.lastEjectTime > this.ejectCooldown
    );
  }
  
  split() {
    if (!this.canSplit()) return [];
    
    const newCells = [];
    const cellsToSplit = [...this.cells].sort((a, b) => b.mass - a.mass);
    const splitCount = Math.min(cellsToSplit.length, this.maxCells - this.cells.length);
    
    for (let i = 0; i < splitCount && this.cells.length < this.maxCells; i++) {
      const cell = cellsToSplit[i];
      if (cell.mass >= 35) {
        const newCell = cell.split(this.targetX, this.targetY);
        if (newCell) {
          this.cells.push(newCell);
          newCells.push(newCell);
        }
      }
    }
    
    this.lastSplitTime = Date.now();
    
    console.log(`Player ${this.address} split into ${this.cells.length} cells`);
    
    return newCells;
  }
  
  eject() {
    if (!this.canEject()) return null;
    
    // Wyrzuć z największej kulki
    const biggestCell = this.getBiggestCell();
    if (!biggestCell) return null;
    
    const ejectedMass = biggestCell.eject(this.targetX, this.targetY);
    
    this.lastEjectTime = Date.now();
    
    return ejectedMass;
  }
  
  die() {
    this.isAlive = false;
    this.cells = [];
  }
  
  // Oblicz aktualną wartość gracza w SOL
  getCurrentValueInSol() {
    return this.solValue / 1000000000;
  }
  
  toJSON() {
    return {
      address: this.address,
      nickname: this.nickname,
      cells: this.cells.map(cell => ({
        id: cell.id,
        x: cell.x,
        y: cell.y,
        mass: cell.mass,
        radius: cell.radius
      })),
      totalMass: this.getTotalMass(),
      centerX: this.x,
      centerY: this.y,
      color: this.color,
      isAlive: this.isAlive,
      score: this.score,
      solValue: this.solValue,
      currentValueSol: this.getCurrentValueInSol(),
      playersEaten: this.playersEaten,
      currentZone: this.currentZone,
      canAdvanceToZone: this.canAdvanceToZone,
      canCashOut: this.canCashOut(),
      combatCooldownRemaining: this.getCombatCooldownRemaining()
    };
  }
}

module.exports = Player;