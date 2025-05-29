// src/components/Canvas.js
import React, { useRef, useEffect, forwardRef } from 'react';

const Canvas = forwardRef(({ playerView, onMouseMove }, ref) => {
  const animationRef = useRef();
  const gridPatternRef = useRef();
  const lastFrameTime = useRef(Date.now());
  const interpolatedPositions = useRef(new Map());
  
  useEffect(() => {
    if (!ref.current) return;
    
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    
    // Ustaw rozmiar canvas
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Stwórz wzór siatki
    const createGridPattern = () => {
      const patternCanvas = document.createElement('canvas');
      const patternCtx = patternCanvas.getContext('2d');
      const gridSize = 50;
      
      patternCanvas.width = gridSize;
      patternCanvas.height = gridSize;
      
      // Białe tło
      patternCtx.fillStyle = '#ffffff';
      patternCtx.fillRect(0, 0, gridSize, gridSize);
      
      // Szara kratka
      patternCtx.strokeStyle = '#f0f0f0';
      patternCtx.lineWidth = 1;
      
      // Rysuj linie siatki
      patternCtx.beginPath();
      patternCtx.moveTo(gridSize, 0);
      patternCtx.lineTo(gridSize, gridSize);
      patternCtx.moveTo(0, gridSize);
      patternCtx.lineTo(gridSize, gridSize);
      patternCtx.stroke();
      
      return ctx.createPattern(patternCanvas, 'repeat');
    };
    
    gridPatternRef.current = createGridPattern();
    
    // Funkcja do przyciemniania koloru
    const darkenColor = (color, percent) => {
      if (color.startsWith('hsl')) {
        const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (match) {
          const h = parseInt(match[1]);
          const s = parseInt(match[2]);
          const l = Math.max(0, parseInt(match[3]) - percent);
          return `hsl(${h}, ${s}%, ${l}%)`;
        }
      }
      return color;
    };
    
    // Funkcja interpolacji dla płynnego ruchu
    const lerp = (start, end, factor) => {
      return start + (end - start) * factor;
    };
    
    // Funkcja renderowania
    const render = (timestamp) => {
      const now = Date.now();
      const deltaTime = (now - lastFrameTime.current) / 1000;
      lastFrameTime.current = now;
      
      // Białe tło
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      if (!playerView || !playerView.player) {
        animationRef.current = requestAnimationFrame(render);
        return;
      }
      
      const { player, players, food, gameState, viewBounds } = playerView;
      
      // Oblicz pozycję kamery (środek wszystkich kulek gracza)
      const cameraX = player.centerX || 0;
      const cameraY = player.centerY || 0;
      
      // Dynamiczny zoom bazowany na rozmiarze gracza
      const screenSize = Math.min(canvas.width, canvas.height);
      const baseZoom = screenSize / 800;
      
      // Zoom zależy od rozpiętości kulek gracza
      let zoomFactor = 1;
      if (viewBounds && viewBounds.width && viewBounds.height) {
        const maxDimension = Math.max(viewBounds.width, viewBounds.height);
        zoomFactor = Math.max(0.5, Math.min(1.5, 800 / maxDimension));
      }
      
      const zoomLevel = baseZoom * zoomFactor;
      
      // Przesunięcie kamery
      const offsetX = canvas.width / 2 / zoomLevel - cameraX;
      const offsetY = canvas.height / 2 / zoomLevel - cameraY;
      
      // Zapisz stan kontekstu
      ctx.save();
      
      // Zastosuj zoom
      ctx.scale(zoomLevel, zoomLevel);
      
      // Przesuń canvas
      ctx.translate(offsetX, offsetY);
      
      // Rysuj tło z siatką
      if (gridPatternRef.current) {
        ctx.fillStyle = gridPatternRef.current;
        ctx.fillRect(
          Math.floor(cameraX / 50) * 50 - 100,
          Math.floor(cameraY / 50) * 50 - 100,
          (canvas.width / zoomLevel) + 200,
          (canvas.height / zoomLevel) + 200
        );
      }
      
      // Rysuj granice mapy
      if (gameState?.mapSize) {
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 5;
        ctx.strokeRect(0, 0, gameState.mapSize, gameState.mapSize);
      }
      
      // Rysuj bariery stref
      if (playerView.barriers) {
        playerView.barriers.forEach(barrier => {
          ctx.strokeStyle = barrier.canPass ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.5)';
          ctx.lineWidth = 5;
          ctx.setLineDash([10, 10]);
          
          ctx.beginPath();
          if (barrier.type === 'horizontal') {
            ctx.moveTo(barrier.x, barrier.y);
            ctx.lineTo(barrier.x + barrier.width, barrier.y);
          } else {
            ctx.moveTo(barrier.x, barrier.y);
            ctx.lineTo(barrier.x, barrier.y + barrier.height);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Rysuj tekst informacyjny o barierze
          if (!barrier.canPass) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const centerX = barrier.type === 'horizontal' ? barrier.x + barrier.width / 2 : barrier.x;
            const centerY = barrier.type === 'vertical' ? barrier.y + barrier.height / 2 : barrier.y;
            
            ctx.fillText('Zone Locked - Need more SOL!', centerX, centerY);
          }
        });
      }
      
      // Rysuj jedzenie
      food.forEach(f => {
        // Cień
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        
        ctx.fillStyle = f.color;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Reset cienia
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      });
      
      // Rysuj graczy - każda kulka osobno
      const allCells = [];
      
      // Zbierz wszystkie kulki ze wszystkich graczy
      players.forEach(p => {
        if (p.cells) {
          p.cells.forEach(cell => {
            allCells.push({
              ...cell,
              playerId: p.id,
              color: p.color,
              nickname: p.nickname,
              isMe: p.isMe,
              solDisplay: p.solDisplay
            });
          });
        }
      });
      
      // Sortuj według rozmiaru (mniejsze najpierw)
      allCells.sort((a, b) => a.radius - b.radius);
      
      // Rysuj każdą kulkę
      allCells.forEach(cell => {
        // Interpolacja pozycji dla płynnego ruchu
        const interpolationKey = `${cell.playerId}_${cell.id}`;
        let interpData = interpolatedPositions.current.get(interpolationKey);
        
        if (!interpData) {
          interpData = { x: cell.x, y: cell.y, targetX: cell.x, targetY: cell.y };
          interpolatedPositions.current.set(interpolationKey, interpData);
        }
        
        // Aktualizuj cel
        interpData.targetX = cell.x;
        interpData.targetY = cell.y;
        
        // Interpoluj pozycję
        const interpSpeed = cell.isMe ? 0.3 : 0.15; // Szybsza interpolacja dla własnego gracza
        interpData.x = lerp(interpData.x, interpData.targetX, interpSpeed);
        interpData.y = lerp(interpData.y, interpData.targetY, interpSpeed);
        
        // Sprawdź czy kulka jest w niebezpieczeństwie
        let inDanger = false;
        if (cell.isMe && player.isAlive) {
          allCells.forEach(other => {
            if (other.playerId !== cell.playerId && other.radius > cell.radius * 1.1) {
              const dx = other.x - interpData.x;
              const dy = other.y - interpData.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance < other.radius + cell.radius + 50) {
                inDanger = true;
              }
            }
          });
        }
        
        // Cień kulki
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;
        
        // Ciało kulki
        ctx.fillStyle = cell.color;
        ctx.beginPath();
        ctx.arc(interpData.x, interpData.y, cell.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Obramowanie
        const borderColor = darkenColor(cell.color, 20);
        if (inDanger) {
          // Pulsujące czerwone obramowanie gdy w niebezpieczeństwie
          const pulse = Math.sin(timestamp * 0.01) * 0.5 + 0.5;
          ctx.strokeStyle = `rgba(255, 0, 0, ${0.5 + pulse * 0.5})`;
          ctx.lineWidth = 3 + pulse * 2;
          ctx.setLineDash([10, 5]);
        } else {
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = cell.isMe ? 3 : 2;
          ctx.setLineDash([]);
        }
        ctx.stroke();
        
        // Reset cienia
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        
        // Nazwa gracza (tylko na największej kulce każdego gracza)
        const playerCells = allCells.filter(c => c.playerId === cell.playerId);
        const isBiggest = playerCells.every(c => c.radius <= cell.radius);
        
        if (isBiggest) {
          // Nazwa
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `${Math.max(12, cell.radius / 4)}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.lineWidth = 3;
          ctx.strokeText(cell.nickname || 'Player', interpData.x, interpData.y - cell.radius / 6);
          ctx.fillText(cell.nickname || 'Player', interpData.x, interpData.y - cell.radius / 6);
          
          // Wartość SOL
          if (cell.solDisplay) {
            ctx.font = `${Math.max(10, cell.radius / 6)}px Arial`;
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.lineWidth = 2;
            const solText = `${cell.solDisplay} SOL`;
            ctx.strokeText(solText, interpData.x, interpData.y + cell.radius / 3);
            ctx.fillText(solText, interpData.x, interpData.y + cell.radius / 3);
          }
        }
        
        // Masa kulki (mniejszy tekst)
        if (cell.isMe || cell.radius > 30) {
          ctx.font = `${Math.max(8, cell.radius / 8)}px Arial`;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const massText = Math.floor(cell.mass).toString();
          ctx.fillText(massText, interpData.x, interpData.y);
        }
      });
      
      // Przywróć stan kontekstu
      ctx.restore();
      
      // Rysuj miniaturkę mapy
      drawMinimap(ctx, canvas, player, gameState, players);
      
      // Czyść stare interpolowane pozycje
      const currentCellIds = new Set(allCells.map(c => `${c.playerId}_${c.id}`));
      for (const [key] of interpolatedPositions.current) {
        if (!currentCellIds.has(key)) {
          interpolatedPositions.current.delete(key);
        }
      }
      
      animationRef.current = requestAnimationFrame(render);
    };
    
    // Funkcja rysowania minimapy
    const drawMinimap = (ctx, canvas, player, gameState, players) => {
      if (!gameState?.mapSize) return;
      
      const minimapSize = 200;
      const minimapPadding = 20;
      const minimapX = canvas.width - minimapSize - minimapPadding;
      const minimapY = canvas.height - minimapSize - minimapPadding;
      
      // Tło minimapy
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);
      
      // Rysuj strefy na minimapie
      if (playerView?.zones) {
        const zoneSize = minimapSize / 2;
        
        // Zone 1 - Bronze (top-left)
        ctx.fillStyle = 'rgba(205, 127, 50, 0.2)';
        ctx.fillRect(minimapX, minimapY, zoneSize, zoneSize);
        
        // Zone 2 - Silver (top-right)
        ctx.fillStyle = 'rgba(192, 192, 192, 0.2)';
        ctx.fillRect(minimapX + zoneSize, minimapY, zoneSize, zoneSize);
        
        // Zone 3 - Gold (bottom-left)
        ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
        ctx.fillRect(minimapX, minimapY + zoneSize, zoneSize, zoneSize);
        
        // Zone 4 - Diamond (bottom-right)
        ctx.fillStyle = 'rgba(185, 242, 255, 0.2)';
        ctx.fillRect(minimapX + zoneSize, minimapY + zoneSize, zoneSize, zoneSize);
        
        // Linie graniczne stref
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(minimapX + zoneSize, minimapY);
        ctx.lineTo(minimapX + zoneSize, minimapY + minimapSize);
        ctx.moveTo(minimapX, minimapY + zoneSize);
        ctx.lineTo(minimapX + minimapSize, minimapY + zoneSize);
        ctx.stroke();
      }
      
      // Obramowanie
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);
      
      // Skala
      const scale = minimapSize / gameState.mapSize;
      
      // Rysuj wszystkich graczy na minimapie
      players.forEach(p => {
        if (p.cells) {
          p.cells.forEach(cell => {
            const clampedX = Math.max(0, Math.min(gameState.mapSize, cell.x));
            const clampedY = Math.max(0, Math.min(gameState.mapSize, cell.y));
            
            const cellMinimapX = minimapX + clampedX * scale;
            const cellMinimapY = minimapY + clampedY * scale;
            const cellMinimapRadius = Math.max(1, cell.radius * scale);
            
            if (cellMinimapX >= minimapX && cellMinimapX <= minimapX + minimapSize &&
                cellMinimapY >= minimapY && cellMinimapY <= minimapY + minimapSize) {
              ctx.fillStyle = p.isMe ? '#FFD700' : p.color;
              ctx.beginPath();
              ctx.arc(cellMinimapX, cellMinimapY, cellMinimapRadius, 0, Math.PI * 2);
              ctx.fill();
              
              if (p.isMe) {
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1;
                ctx.stroke();
              }
            }
          });
        }
      });
      
      // Obszar widoczny
      if (playerView.viewBounds) {
        const viewX = minimapX + playerView.viewBounds.minX * scale;
        const viewY = minimapY + playerView.viewBounds.minY * scale;
        const viewWidth = playerView.viewBounds.width * scale;
        const viewHeight = playerView.viewBounds.height * scale;
        
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          Math.max(minimapX, viewX),
          Math.max(minimapY, viewY),
          Math.min(viewWidth, minimapX + minimapSize - viewX),
          Math.min(viewHeight, minimapY + minimapSize - viewY)
        );
      }
    };
    
    // Rozpocznij renderowanie
    render();
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [playerView, ref]);
  
  return (
    <canvas
      ref={ref}
      className="game-canvas"
      onMouseMove={onMouseMove}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
});

Canvas.displayName = 'Canvas';

export default Canvas;