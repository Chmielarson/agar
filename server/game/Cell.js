// server/game/Cell.js
class Cell {
  constructor(x, y, mass, playerId) {
    this.id = `${playerId}_cell_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.playerId = playerId;
    this.x = x;
    this.y = y;
    this.mass = mass;
    this.radius = this.calculateRadius();
    
    // Prędkość
    this.velocityX = 0;
    this.velocityY = 0;
    
    // Czas podziału - używane do określenia kiedy można połączyć
    this.splitTime = 0;
    
    // Czy to jest wyrzucona masa (można zjeść natychmiast)
    this.isEjected = false;
    
    // Recombine timer
    this.canRecombine = true;
  }
  
  calculateRadius() {
    return Math.sqrt(this.mass / Math.PI) * 5;
  }
  
  updateRadius() {
    this.radius = this.calculateRadius();
  }
  
  update(deltaTime, mapSize) {
    // Zastosuj prędkość
    if (this.velocityX !== 0 || this.velocityY !== 0) {
      this.x += this.velocityX * deltaTime;
      this.y += this.velocityY * deltaTime;
      
      // Tłumienie prędkości
      const friction = 0.94;
      this.velocityX *= friction;
      this.velocityY *= friction;
      
      // Zatrzymaj jeśli prędkość jest bardzo mała
      if (Math.abs(this.velocityX) < 0.1) this.velocityX = 0;
      if (Math.abs(this.velocityY) < 0.1) this.velocityY = 0;
    }
    
    // Granice mapy
    const margin = this.radius * 0.3;
    this.x = Math.max(-margin, Math.min(mapSize + margin, this.x));
    this.y = Math.max(-margin, Math.min(mapSize + margin, this.y));
    
    // Stopniowa utrata masy (0.2% na sekundę) tylko jeśli masa > 20
    if (this.mass > 20) {
      this.mass *= (1 - 0.002 * deltaTime);
      this.updateRadius();
    }
  }
  
  // Sprawdź czy można połączyć z inną kulką tego samego gracza
  canMergeWith(otherCell) {
    if (this.playerId !== otherCell.playerId) return false;
    if (this.isEjected || otherCell.isEjected) return false;
    
    const now = Date.now();
    const timeSinceSplit = Math.max(
      now - this.splitTime,
      now - otherCell.splitTime
    );
    
    // Czas do połączenia zależy od masy
    const totalMass = this.mass + otherCell.mass;
    const mergeTime = Math.min(30000, totalMass * 10); // Max 30 sekund
    
    return timeSinceSplit >= mergeTime;
  }
  
  // Podziel kulkę
  split(targetX, targetY) {
    if (this.mass < 35) return null;
    
    // Podziel masę na pół
    const newMass = this.mass / 2;
    this.mass = newMass;
    this.updateRadius();
    
    // Oblicz kierunek
    const angle = Math.atan2(targetY - this.y, targetX - this.x);
    
    // Stwórz nową kulkę
    const newCell = new Cell(
      this.x + Math.cos(angle) * this.radius * 2,
      this.y + Math.sin(angle) * this.radius * 2,
      newMass,
      this.playerId
    );
    
    // Nadaj prędkość
    const splitSpeed = Math.max(300, 500 - this.mass * 0.5); // Mniejsze kulki lecą szybciej
    newCell.velocityX = Math.cos(angle) * splitSpeed;
    newCell.velocityY = Math.sin(angle) * splitSpeed;
    newCell.splitTime = Date.now();
    
    // Ustaw czas podziału dla obu kulek
    this.splitTime = Date.now();
    this.canRecombine = false;
    newCell.canRecombine = false;
    
    return newCell;
  }
  
  // Wyrzuć masę
  eject(targetX, targetY) {
    if (this.mass < 35) return null;
    
    const ejectMass = 15;
    this.mass -= ejectMass;
    this.updateRadius();
    
    const angle = Math.atan2(targetY - this.y, targetX - this.x);
    const distance = this.radius + 20;
    
    const ejectedCell = new Cell(
      this.x + Math.cos(angle) * distance,
      this.y + Math.sin(angle) * distance,
      ejectMass,
      this.playerId
    );
    
    // Nadaj prędkość
    ejectedCell.velocityX = Math.cos(angle) * 24;
    ejectedCell.velocityY = Math.sin(angle) * 24;
    ejectedCell.isEjected = true;
    
    return ejectedCell;
  }
  
  toJSON() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      mass: this.mass,
      radius: this.radius,
      velocityX: this.velocityX,
      velocityY: this.velocityY,
      canRecombine: this.canRecombine,
      isEjected: this.isEjected
    };
  }
}

module.exports = Cell;