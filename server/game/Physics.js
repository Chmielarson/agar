// server/game/Physics.js
class Physics {
  constructor() {
    // Stałe fizyczne
    this.friction = 0.95;
    this.restitution = 0.8;
  }
  
  // Sprawdzanie kolizji między okręgami
  checkCircleCollision(obj1, obj2) {
    const distance = this.getDistance(obj1, obj2);
    return distance < obj1.radius + obj2.radius;
  }
  
  // Sprawdzanie kolizji między okręgami z procentem pokrycia
  checkCircleCollisionWithOverlap(obj1, obj2, overlapPercent = 0.8) {
    const distance = this.getDistance(obj1, obj2);
    
    // Jeśli nie ma żadnej kolizji, zwróć false
    if (distance > obj1.radius + obj2.radius) {
      return false;
    }
    
    // Oblicz głębokość penetracji
    const overlap = obj1.radius + obj2.radius - distance;
    
    // Sprawdź jaki procent mniejszego obiektu jest pokryty
    const smallerRadius = Math.min(obj1.radius, obj2.radius);
    const overlapRatio = overlap / (smallerRadius * 2);
    
    // Zwróć true tylko jeśli pokrycie jest większe niż wymagany procent
    return overlapRatio >= overlapPercent;
  }
  
  // Obliczanie odległości między obiektami
  getDistance(obj1, obj2) {
    const dx = obj2.x - obj1.x;
    const dy = obj2.y - obj1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  // Sprawdzanie czy obj1 może zjeść obj2
  canEat(obj1, obj2) {
    // obj1 musi być większy o co najmniej 10%
    return obj1.radius > obj2.radius * 1.1;
  }
  
  // Sprawdzanie kolizji między graczami (multi-cell)
  checkPlayerCollision(player1, player2) {
    const collisions = [];
    
    // Sprawdź każdą kulkę player1 z każdą kulką player2
    for (const cell1 of player1.cells) {
      for (const cell2 of player2.cells) {
        if (this.checkCircleCollision(cell1, cell2)) {
          collisions.push({
            cell1,
            cell2,
            canEat: this.canEat(cell1, cell2) || this.canEat(cell2, cell1)
          });
        }
      }
    }
    
    return collisions;
  }
  
  // Sprawdzanie kolizji gracza z jedzeniem
  checkPlayerFoodCollision(player, food) {
    const collisions = [];
    
    for (const cell of player.cells) {
      if (this.checkCircleCollision(cell, food)) {
        if (cell.radius > food.radius) {
          collisions.push({
            cell,
            food
          });
        }
      }
    }
    
    return collisions;
  }
  
  // Sprawdzanie czy gracz może zjeść innego gracza (WSZYSTKIE kulki)
  canPlayerEatPlayer(player1, player2) {
    // Gracz może zjeść innego jeśli KAŻDA jego kulka jest większa od KAŻDEJ kulki przeciwnika
    for (const cell2 of player2.cells) {
      let canBeEaten = false;
      
      for (const cell1 of player1.cells) {
        if (this.checkCircleCollisionWithOverlap(cell1, cell2, 0.8) && this.canEat(cell1, cell2)) {
          canBeEaten = true;
          break;
        }
      }
      
      if (!canBeEaten) {
        return false; // Jeśli choć jedna kulka nie może być zjedzona, gracz nie może być zjedzony
      }
    }
    
    return true;
  }
  
  // Obliczanie nowej masy po zjedzeniu
  calculateNewMass(eaterMass, foodMass) {
    return eaterMass + foodMass * 0.8; // 80% efektywność
  }
  
  // Sprawdzanie czy obiekt jest w obszarze widoczności
  isInViewport(viewer, target, viewportRadius) {
    // Dla gracza z wieloma kulkami, sprawdź środek masy
    const viewerPos = viewer.getCenterPosition ? viewer.getCenterPosition() : viewer;
    const targetPos = target.getCenterPosition ? target.getCenterPosition() : target;
    
    const dx = targetPos.x - viewerPos.x;
    const dy = targetPos.y - viewerPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Dodaj największy promień celu do zasięgu
    const targetRadius = target.radius || (target.getBiggestCell ? target.getBiggestCell().radius : 0);
    
    return distance < viewportRadius + targetRadius;
  }
  
  // Obliczanie prędkości na podstawie masy
  calculateSpeed(mass, baseSpeed = 50) {
    // Im większa masa, tym wolniejszy ruch
    return baseSpeed * (20 / (mass + 20));
  }
  
  // Elastyczne odbicie przy kolizji między kulkami tego samego gracza
  resolveSamePlayerCollision(cell1, cell2) {
    const dx = cell2.x - cell1.x;
    const dy = cell2.y - cell1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return; // Uniknij dzielenia przez zero
    
    // Normalizuj wektor
    const nx = dx / distance;
    const ny = dy / distance;
    
    // Minimalna odległość
    const minDistance = cell1.radius + cell2.radius;
    
    // Rozdziel kulki jeśli się przenikają
    const overlap = minDistance - distance;
    if (overlap > 0) {
      const separationX = nx * overlap * 0.5;
      const separationY = ny * overlap * 0.5;
      
      cell1.x -= separationX;
      cell1.y -= separationY;
      cell2.x += separationX;
      cell2.y += separationY;
      
      // Dodaj lekkie odpychanie
      const repelForce = 5;
      cell1.velocityX -= nx * repelForce;
      cell1.velocityY -= ny * repelForce;
      cell2.velocityX += nx * repelForce;
      cell2.velocityY += ny * repelForce;
    }
  }
  
  // Interpolacja dla płynnego ruchu
  lerp(start, end, factor) {
    return start + (end - start) * factor;
  }
  
  // Ograniczenie wartości do zakresu
  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  
  // Oblicz obszar widoczny dla gracza z wieloma kulkami
  calculateViewBounds(player) {
    if (player.cells.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const cell of player.cells) {
      minX = Math.min(minX, cell.x - cell.radius);
      maxX = Math.max(maxX, cell.x + cell.radius);
      minY = Math.min(minY, cell.y - cell.radius);
      maxY = Math.max(maxY, cell.y + cell.radius);
    }
    
    // Dodaj margines
    const margin = 100;
    return {
      minX: minX - margin,
      maxX: maxX + margin,
      minY: minY - margin,
      maxY: maxY + margin,
      width: maxX - minX + 2 * margin,
      height: maxY - minY + 2 * margin
    };
  }
}

module.exports = Physics;