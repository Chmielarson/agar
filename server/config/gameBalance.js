// server/config/gameBalance.js
module.exports = {
  // Parametry mas i rozmiarów
  mass: {
    startBase: 20,                    // Bazowa masa startowa
    perSol: 1000,                     // Dodatkowa masa per 1 SOL
    minMass: 10,                      // Minimalna masa kulki
    maxMass: 100000,                  // Maksymalna masa kulki
    lossRate: 0.002,                  // Utrata masy per sekunda (0.2%)
    lossThreshold: 20,                // Próg masy poniżej którego nie traci się masy
    radiusMultiplier: 5,              // Mnożnik do obliczania promienia z masy
    ejectMass: 15,                    // Masa wyrzucanej kulki
    minSplitMass: 35,                 // Minimalna masa do podziału
    splitMassRatio: 0.5               // Stosunek masy przy podziale
  },
  
  // Parametry prędkości
  speed: {
    baseSpeed: 3,                     // Bazowa prędkość
    massSpeedFactor: 30,              // Współczynnik wpływu masy na prędkość
    minSpeedMultiplier: 0.3,          // Minimalny mnożnik prędkości
    maxSpeed: 180,                    // Maksymalna prędkość (baseSpeed * 60)
    friction: 0.94,                   // Tarcie (tłumienie prędkości)
    splitBoostSpeed: 500,             // Prędkość boost przy podziale
    ejectSpeed: 400,                  // Prędkość wyrzucanej masy
    accelerationMultiplier: 2         // Mnożnik przyspieszenia
  },
  
  // Parametry jedzenia
  food: {
    minSize: 10,                      // Minimalna wielkość jedzenia
    maxSize: 25,                      // Maksymalna wielkość jedzenia
    baseFoodPerZone: 300,             // Bazowa ilość jedzenia per strefa
    foodPerPlayerMultiplier: 50,      // Dodatkowe jedzenie per gracz
    maxFoodPerZone: 1000,             // Max jedzenie per strefa
    maxTotalFood: 4000,               // Max całkowite jedzenie
    respawnDelay: 0,                  // Opóźnienie respawnu jedzenia (ms)
    massToFoodRatio: 0.8              // Współczynnik konwersji masy gracza na jedzenie
  },
  
  // Parametry kulek
  cells: {
    maxCells: 4,                      // Maksymalna liczba kulek gracza
    splitCooldown: 100,               // Cooldown między podziałami (ms)
    ejectCooldown: 100,               // Cooldown między wyrzucaniem (ms)
    recombineTime: 30000,             // Bazowy czas do ponownego połączenia (30s)
    recombineTimePerMass: 10,         // Dodatkowy czas per jednostka masy (ms)
    maxRecombineTime: 60000,          // Maksymalny czas do połączenia (60s)
    minRecombineDistance: 1.0         // Minimalna odległość do połączenia (promienie)
  },
  
  // Parametry kolizji
  collision: {
    eatSizeRatio: 1.1,                // Stosunek rozmiaru do zjedzenia (10% większy)
    overlapThreshold: 0.8,            // Próg pokrycia do zjedzenia (80%)
    pushForce: 5,                     // Siła odpychania między kulkami tego samego gracza
    bounceRestitution: 0.8            // Współczynnik odbicia
  },
  
  // Parametry walki i cash out
  combat: {
    cooldownDuration: 10000,          // Czas blokady cash out po walce (10s)
    combatDetectionRadius: 1.2,       // Promień wykrywania walki (120% sumy promieni)
    safeZoneMultiplier: 0.5           // Mnożnik bezpiecznej strefy wokół spawnu
  },
  
  // Parametry stref
  zones: {
    1: { // Bronze
      name: 'Bronze Zone',
      minSol: 0,
      maxSol: 1,
      color: '#CD7F32',
      speedMultiplier: 1.0,           // Normalna prędkość
      massLossMultiplier: 1.0,         // Normalna utrata masy
      foodValueMultiplier: 1.0         // Normalna wartość jedzenia
    },
    2: { // Silver
      name: 'Silver Zone',
      minSol: 1,
      maxSol: 5,
      color: '#C0C0C0',
      speedMultiplier: 0.95,            // Lekko wolniej
      massLossMultiplier: 1.1,          // Szybsza utrata masy
      foodValueMultiplier: 1.2          // Lepsze jedzenie
    },
    3: { // Gold
      name: 'Gold Zone',
      minSol: 5,
      maxSol: 10,
      color: '#FFD700',
      speedMultiplier: 0.9,             // Wolniej
      massLossMultiplier: 1.2,          // Jeszcze szybsza utrata
      foodValueMultiplier: 1.5          // Jeszcze lepsze jedzenie
    },
    4: { // Diamond
      name: 'Diamond Zone',
      minSol: 10,
      maxSol: Infinity,
      color: '#B9F2FF',
      speedMultiplier: 0.85,            // Najwolniej
      massLossMultiplier: 1.3,          // Najszybsza utrata
      foodValueMultiplier: 2.0          // Najlepsze jedzenie
    }
  },
  
  // Parametry ekonomii
  economy: {
    platformFeePercent: 5,            // Prowizja platformy (5%)
    minStake: 0.05,                   // Minimalna stawka (SOL)
    maxStake: 10,                     // Maksymalna stawka (SOL)
    solToMassRatio: 1000,             // SOL do masy (1 SOL = 1000 masy)
    killRewardBonus: 0.1              // Bonus za zabicie (10% wartości przeciwnika)
  },
  
  // Parametry wydajności
  performance: {
    tickRate: 60,                     // Częstotliwość aktualizacji (FPS)
    networkTickRate: 30,              // Częstotliwość wysyłania do klientów
    viewDistance: 1000,               // Bazowa odległość widoku
    maxPlayersInView: 50,             // Max graczy w widoku
    compressionEnabled: true,         // Kompresja danych sieciowych
    adaptiveQuality: true             // Adaptacyjna jakość grafiki
  },
  
  // Funkcje pomocnicze
  calculateSpeed(mass, baseSpeed = null) {
    const base = baseSpeed || this.speed.baseSpeed;
    const factor = this.speed.massSpeedFactor / (Math.sqrt(mass) + 20);
    return Math.max(base * this.speed.minSpeedMultiplier, base * factor);
  },
  
  calculateRadius(mass) {
    return Math.sqrt(mass / Math.PI) * this.mass.radiusMultiplier;
  },
  
  calculateRecombineTime(totalMass) {
    const time = this.cells.recombineTime + (totalMass * this.cells.recombineTimePerMass);
    return Math.min(time, this.cells.maxRecombineTime);
  },
  
  canEat(eaterRadius, victimRadius) {
    return eaterRadius > victimRadius * this.collision.eatSizeRatio;
  },
  
  getZoneConfig(zoneId) {
    return this.zones[zoneId] || this.zones[1];
  }
};