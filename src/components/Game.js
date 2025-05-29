// src/components/Game.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import Canvas from './Canvas';
import WebRTCManager from './WebRTCManager';
import { cashOut } from '../utils/SolanaTransactions';
import './Game.css';

export default function Game({ initialStake, nickname, onLeaveGame, setPendingCashOut, socket }) {
  const wallet = useWallet();
  const { publicKey } = wallet;
  
  const [gameState, setGameState] = useState(null);
  const [playerView, setPlayerView] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isPlayerDead, setIsPlayerDead] = useState(false);
  const [isCashingOut, setIsCashingOut] = useState(false);
  const [showCashOutModal, setShowCashOutModal] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Łączenie...');
  const [deathReason, setDeathReason] = useState('');
  const [combatCooldown, setCombatCooldown] = useState(0);
  const [error, setError] = useState('');
  const [webrtcManager, setWebrtcManager] = useState(null);
  
  const canvasRef = useRef(null);
  const inputRef = useRef({
    mouseX: 0,
    mouseY: 0,
    split: false,
    eject: false
  });
  
  const joinTimeoutRef = useRef(null);
  
  // WebRTC Manager setup
  useEffect(() => {
    if (playerView?.player && socket && publicKey) {
      console.log('Inicjalizacja WebRTC Manager dla strefy:', playerView.player.currentZone);
      
      const manager = new WebRTCManager(socket, publicKey.toString());
      
      // Callback dla aktualizacji pozycji od innych graczy
      manager.onPlayerPositionUpdate = (address, position) => {
        // Aktualizuj lokalnie pozycje innych graczy
        // To pozwoli na płynniejszą grę przy wysokim opóźnieniu do serwera
        console.log('P2P position update from:', address, position);
      };
      
      // Callback dla akcji innych graczy
      manager.onPlayerAction = (address, action) => {
        console.log('P2P player action from:', address, action);
      };
      
      setWebrtcManager(manager);
      
      // Dołącz do strefy P2P
      manager.joinZone(playerView.player.currentZone);
      
      return () => {
        console.log('Czyszczenie WebRTC Manager');
        manager.destroy();
        setWebrtcManager(null);
      };
    }
  }, [playerView?.player?.currentZone, socket, publicKey]);
  
  // Wysyłaj pozycję przez WebRTC
  useEffect(() => {
    if (!webrtcManager || !playerView?.player || !isConnected) return;
    
    const broadcastPosition = () => {
      if (playerView.player.cells && playerView.player.cells.length > 0) {
        webrtcManager.broadcastPlayerPosition({
          cells: playerView.player.cells.map(cell => ({
            id: cell.id,
            x: cell.x,
            y: cell.y,
            radius: cell.radius
          })),
          timestamp: Date.now()
        });
      }
    };
    
    // Broadcast pozycji co 50ms przez P2P (20 FPS)
    const interval = setInterval(broadcastPosition, 50);
    
    return () => clearInterval(interval);
  }, [webrtcManager, playerView, isConnected]);
  
  // Timer dla combat cooldown
  useEffect(() => {
    if (playerView?.player?.combatCooldownRemaining > 0) {
      setCombatCooldown(playerView.player.combatCooldownRemaining);
      
      const timer = setInterval(() => {
        setCombatCooldown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(timer);
    } else {
      setCombatCooldown(0);
    }
  }, [playerView?.player?.combatCooldownRemaining]);
  
  // Zapobiegaj przewijaniu strony podczas gry
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalHeight = document.body.style.height;
    
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.height = '100vh';
    document.body.style.width = '100vw';
    
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.height = originalHeight;
      document.body.style.width = '';
    };
  }, []);
  
  // Connect to game
  useEffect(() => {
    if (!socket || !publicKey) {
      console.log('Brak socket lub publicKey:', { socket: !!socket, publicKey: !!publicKey });
      return;
    }
    
    console.log('Konfiguracja połączenia z grą...');
    setConnectionStatus('Łączenie z serwerem...');
    
    let isComponentMounted = true;
    let hasJoinedGame = false;
    
    // Funkcja do dołączenia do gry
    const joinGame = () => {
      if (!isComponentMounted || hasJoinedGame) {
        console.log('Pomijam join_game - komponent odmontowany lub już dołączył');
        return;
      }
      
      console.log('Wysyłanie join_game:', {
        playerAddress: publicKey.toString(),
        nickname,
        initialStake,
        socketId: socket.id,
        connected: socket.connected
      });
      
      hasJoinedGame = true;
      
      socket.emit('join_game', {
        playerAddress: publicKey.toString(),
        nickname: nickname || `Player ${publicKey.toString().substring(0, 6)}`,
        initialStake: initialStake
      });
      
      // Ustaw timeout dla otrzymania początkowego widoku
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
      }
      
      joinTimeoutRef.current = setTimeout(() => {
        if (!playerView && isComponentMounted) {
          console.error('Timeout czekania na player view');
          setConnectionStatus('Serwer nie odpowiada - spróbuj odświeżyć');
          setError('Nie udało się otrzymać danych gry z serwera. Odśwież stronę i spróbuj ponownie.');
        }
      }, 10000); // 10 sekund timeout
    };
    
    // Event handlers
    const handleConnect = () => {
      console.log('Socket połączony:', socket.id);
      setConnectionStatus('Połączono - dołączam do gry...');
      // Dołącz do gry po połączeniu
      joinGame();
    };
    
    const handleDisconnect = (reason) => {
      console.log('Socket rozłączony:', reason);
      setIsConnected(false);
      setConnectionStatus('Rozłączono z serwerem');
      hasJoinedGame = false; // Reset flagi przy rozłączeniu
      
      if (reason === 'io server disconnect') {
        setError('Zostałeś rozłączony przez serwer');
      } else if (reason === 'transport error') {
        setError('Błąd połączenia - sprawdź czy serwer działa');
      }
    };
    
    const handleConnectError = (error) => {
      console.error('Błąd połączenia socket:', error);
      setConnectionStatus('Błąd połączenia - ponawiam...');
      setError(`Błąd połączenia: ${error.message}`);
    };
    
    const handleJoinedGame = (data) => {
      console.log('Otrzymano joined_game:', data);
      if (data.success) {
        setIsConnected(true);
        setConnectionStatus('Połączono z grą - czekam na widok');
        setError(''); // Wyczyść błędy
      } else {
        setConnectionStatus('Nie udało się dołączyć do gry');
        setError(data.error || 'Nieznany błąd');
        hasJoinedGame = false; // Reset flagi jeśli błąd
      }
    };
    
    const handleGameState = (state) => {
      console.log('Otrzymano game_state - gracze:', state.playerCount);
      setGameState(state);
    };
    
    const handlePlayerView = (view) => {
      if (!view) {
        console.error('Otrzymano null player view');
        return;
      }
      
      console.log('Otrzymano player_view - pozycja:', 
        view.player ? `(${Math.floor(view.player.centerX)}, ${Math.floor(view.player.centerY)})` : 'brak',
        'Strefa:', view.player?.currentZone
      );
      
      // Wyczyść timeout
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = null;
      }
      
      setError('');
      setPlayerView(view);
      setConnectionStatus('W grze');
      
      // Zainicjalizuj pozycję myszy
      if (view.player && inputRef.current.mouseX === 0 && inputRef.current.mouseY === 0) {
        inputRef.current.mouseX = view.player.centerX;
        inputRef.current.mouseY = view.player.centerY;
      }
    };
    
    const handlePlayerEliminated = (data) => {
      console.log('Gracz wyeliminowany:', data);
      if (data.playerAddress === publicKey.toString()) {
        setIsPlayerDead(true);
        setDeathReason(data.reason || 'Zostałeś zjedzony przez innego gracza!');
        setPlayerView(null);
        localStorage.removeItem('dotara_io_game_state');
        localStorage.removeItem('dotara_io_pending_cashout');
      }
    };
    
    const handleCashOutResult = (result) => {
      console.log('Cash out zakończony pomyślnie:', result);
      onLeaveGame();
    };
    
    const handleError = (error) => {
      console.error('Błąd gry:', error);
      setConnectionStatus(`Błąd: ${error.message || error}`);
      setError(error.message || error);
      hasJoinedGame = false; // Reset flagi przy błędzie
      
      if (error.message && error.message.includes('eaten')) {
        setIsPlayerDead(true);
        setDeathReason(error.message);
        localStorage.removeItem('dotara_io_game_state');
      }
    };
    
    // Najpierw usuń wszystkie stare listenery
    socket.off('connect');
    socket.off('disconnect');
    socket.off('connect_error');
    socket.off('joined_game');
    socket.off('game_state');
    socket.off('player_view');
    socket.off('player_eliminated');
    socket.off('cash_out_result');
    socket.off('error');
    
    // Zarejestruj nowe listenery
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('joined_game', handleJoinedGame);
    socket.on('game_state', handleGameState);
    socket.on('player_view', handlePlayerView);
    socket.on('player_eliminated', handlePlayerEliminated);
    socket.on('cash_out_result', handleCashOutResult);
    socket.on('error', handleError);
    
    // Sprawdź czy socket jest już połączony
    if (socket.connected) {
      console.log('Socket już połączony przy mount, dołączam do gry...');
      handleConnect(); // Wywołaj ręcznie jeśli już połączony
    } else {
      console.log('Socket nie jest połączony, czekam na event connect...');
    }
    
    // Cleanup
    return () => {
      console.log('Czyszczenie połączenia z grą');
      isComponentMounted = false;
      
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
      }
      
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('joined_game', handleJoinedGame);
      socket.off('game_state', handleGameState);
      socket.off('player_view', handlePlayerView);
      socket.off('player_eliminated', handlePlayerEliminated);
      socket.off('cash_out_result', handleCashOutResult);
      socket.off('error', handleError);
    };
  }, [socket, publicKey, nickname, initialStake]); // Usuń onLeaveGame z dependencies
  
  // Wyczyść timeout gdy dostaniemy player view
  useEffect(() => {
    if (playerView && joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
  }, [playerView]);
  
  // Wysyłaj input gracza
  useEffect(() => {
    if (!socket || !isConnected || !publicKey || isPlayerDead) return;
    
    const sendInput = () => {
      const input = { ...inputRef.current };
      
      socket.emit('player_input', {
        playerAddress: publicKey.toString(),
        input: input
      });
      
      // Broadcast akcje przez WebRTC jeśli są
      if (webrtcManager && (input.split || input.eject)) {
        webrtcManager.broadcastPlayerPosition({
          type: 'action',
          action: input.split ? 'split' : 'eject',
          timestamp: Date.now()
        });
      }
      
      // Reset jednorazowych akcji
      inputRef.current.split = false;
      inputRef.current.eject = false;
    };
    
    const interval = setInterval(sendInput, 33); // 30 FPS
    
    return () => clearInterval(interval);
  }, [socket, isConnected, publicKey, isPlayerDead, webrtcManager]);
  
  // Obsługa myszy
  const handleMouseMove = useCallback((e) => {
    if (!canvasRef.current || isPlayerDead) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setMousePosition({ x, y });
    
    // Konwersja do współrzędnych świata gry
    if (playerView && playerView.player) {
      const canvas = canvasRef.current;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      // Oblicz poziom zoom na podstawie granic widoku
      const screenSize = Math.min(canvas.width, canvas.height);
      const baseZoom = screenSize / 800;
      let zoomFactor = 1;
      
      if (playerView.viewBounds && playerView.viewBounds.width && playerView.viewBounds.height) {
        const maxDimension = Math.max(playerView.viewBounds.width, playerView.viewBounds.height);
        zoomFactor = Math.max(0.5, Math.min(1.5, 800 / maxDimension));
      }
      
      const zoomLevel = baseZoom * zoomFactor;
      
      // Oblicz pozycję w świecie gry z uwzględnieniem zoom
      const worldX = playerView.player.centerX + (x - centerX) / zoomLevel;
      const worldY = playerView.player.centerY + (y - centerY) / zoomLevel;
      
      inputRef.current.mouseX = worldX;
      inputRef.current.mouseY = worldY;
    }
  }, [playerView, isPlayerDead]);
  
  // Obsługa klawiatury
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isPlayerDead) return;
      
      switch(e.key) {
        case ' ':
          e.preventDefault();
          inputRef.current.split = true;
          break;
        case 'w':
        case 'W':
          e.preventDefault();
          inputRef.current.eject = true;
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlayerDead]);
  
  // Obsługa cash out
  const handleCashOut = async () => {
    if (!playerView || !playerView.player || isCashingOut) return;
    
    if (playerView.player.solValue === 0) {
      alert('Nie masz SOL do wypłaty!');
      return;
    }
    
    // Sprawdź cooldown walki
    if (!playerView.player.canCashOut) {
      console.log('Nie można wypłacić - w trakcie walki!');
      return;
    }
    
    setShowCashOutModal(true);
  };
  
  const confirmCashOut = async () => {
    try {
      setIsCashingOut(true);
      
      // Najpierw usuń gracza z gry na serwerze
      socket.emit('initiate_cash_out', {
        playerAddress: publicKey.toString()
      });
      
      // Czekaj na potwierdzenie
      socket.once('cash_out_initiated', async (data) => {
        if (data.success) {
          // Zapisz dane do wypłaty w localStorage - użyj wartości z serwera!
          const cashOutData = {
            playerAddress: publicKey.toString(),
            amount: data.amount, // Serwer zwraca aktualną wartość
            timestamp: Date.now()
          };
          
          localStorage.setItem('dotara_io_pending_cashout', JSON.stringify(cashOutData));
          
          // Ustaw dane przed przekierowaniem
          setPendingCashOut(cashOutData);
          
          // Przejdź do widoku wypłaty
          onLeaveGame(true); // true = oczekująca wypłata
        } else {
          alert('Nie udało się zainicjować wypłaty. Spróbuj ponownie.');
          setIsCashingOut(false);
        }
      });
      
    } catch (error) {
      console.error('Błąd podczas inicjowania wypłaty:', error);
      alert(`Błąd: ${error.message}`);
      setIsCashingOut(false);
    } finally {
      setShowCashOutModal(false);
    }
  };
  
  // Formatuj wartość SOL
  const formatSol = (lamports) => {
    return (lamports / 1000000000).toFixed(4);
  };
  
  // Renderuj przycisk cash out z timerem
  const renderCashOutButton = () => {
    if (!playerView?.player || !playerView.player.isAlive) return null;
    
    const canCashOut = playerView.player.canCashOut;
    const cooldownRemaining = combatCooldown;
    
    if (!canCashOut && cooldownRemaining > 0) {
      // Przycisk z timerem walki
      const progressWidth = (cooldownRemaining / 10) * 100;
      
      return (
        <button 
          className="cash-out-btn combat-timer"
          disabled={true}
          style={{
            '--progress-width': `${progressWidth}%`
          }}
        >
          <div className="timer-text">
            <span>⚔️</span>
            <span>Walka {cooldownRemaining}s</span>
          </div>
          <style jsx>{`
            .cash-out-btn.combat-timer::before {
              width: var(--progress-width);
            }
          `}</style>
        </button>
      );
    }
    
    // Normalny przycisk cash out
    return (
      <button 
        className="cash-out-btn"
        onClick={handleCashOut}
        disabled={isCashingOut || !canCashOut}
      >
        💰 Wypłać ({formatSol(playerView.player.solValue)} SOL)
      </button>
    );
  };
  
  // Pokaż ekran ładowania jeśli nie ma jeszcze player view i gracz nie jest martwy
  if (!playerView && !isPlayerDead) {
    return (
      <div className="game-container">
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: '#333',
          background: 'white',
          padding: '40px',
          borderRadius: '20px',
          border: '4px solid #16A085',
          boxShadow: '8px 8px 0 rgba(0, 0, 0, 0.1)'
        }}>
          <h2>{connectionStatus}</h2>
          <div className="spinner" style={{ margin: '20px auto' }}></div>
          <p>Czekam na dane gry...</p>
          {error && (
            <div style={{
              marginTop: '20px',
              padding: '15px',
              background: '#FFEBEE',
              border: '3px solid #E74C3C',
              borderRadius: '12px',
              color: '#C0392B',
              fontWeight: 700
            }}>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <div className="game-container">
      {/* UI gry - pokazuj tylko gdy gracz żyje */}
      {playerView && !isPlayerDead && (
        <div className="game-ui">
          {/* PRAWY GÓRNY RÓG - Ranking */}
          <div className="leaderboard">
            <h3>Ranking</h3>
            {gameState?.leaderboard?.map((player, index) => (
              <div key={player.address} className="leaderboard-item">
                <span className="rank">{player.rank}.</span>
                <span className="nickname">{player.nickname}</span>
                <span className="zone-badge" style={{ 
                  color: player.zone === 1 ? '#CD7F32' : 
                         player.zone === 2 ? '#C0C0C0' : 
                         player.zone === 3 ? '#FFD700' : '#B9F2FF' 
                }}>
                  S{player.zone}
                </span>
                <span className="sol">{player.solDisplay} SOL</span>
              </div>
            ))}
          </div>
          
          {/* LEWY GÓRNY RÓG - Statystyki gry + Info o graczu */}
          {gameState && playerView?.player && (
            <div className="game-info">
              <div className="info-item">
                <span>Twoje kulki:</span>
                <span className="value">{playerView.player.cells?.length || 1}/{4}</span>
              </div>
              <div className="info-item">
                <span>Całkowita masa:</span>
                <span className="value">{Math.floor(playerView.player.totalMass || playerView.player.mass)}</span>
              </div>
              <div className="info-item">
                <span>Zjedzeni gracze:</span>
                <span className="value">{playerView.player.playersEaten || 0}</span>
              </div>
              <div className="info-item" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '2px solid #ECF0F1' }}>
                <span>Aktywni gracze:</span>
                <span className="value">{gameState.playerCount}</span>
              </div>
              <div className="info-item">
                <span>Całkowity SOL:</span>
                <span className="value">{gameState.totalSolDisplay} SOL</span>
              </div>
              {playerView.player.canAdvanceToZone && (
                <div className="info-item" style={{ color: '#16A085', marginTop: '10px' }}>
                  <span>Możesz przejść do:</span>
                  <span className="value">Strefa {playerView.player.canAdvanceToZone}</span>
                </div>
              )}
              {webrtcManager && (
                <div className="info-item" style={{ fontSize: '12px', color: '#7F8C8D', marginTop: '10px' }}>
                  <span>P2P:</span>
                  <span className="value">{webrtcManager.peers.size} graczy</span>
                </div>
              )}
            </div>
          )}
          
          {/* LEWY DOLNY RÓG - Sterowanie */}
          <div className="controls">
            <div className="control-item">
              <kbd>Mysz</kbd> - Ruch
            </div>
            <div className="control-item">
              <kbd>Spacja</kbd> - Podział (max 4 kulki)
            </div>
            <div className="control-item">
              <kbd>W</kbd> - Wyrzuć masę
            </div>
            <div className="control-item" style={{ marginTop: '10px', fontSize: '12px', color: '#7F8C8D' }}>
              Kulki łączą się po ~30s
            </div>
          </div>
          
          {/* ŚRODEK DÓŁ - Przyciski akcji */}
          <div className="action-buttons">
            {renderCashOutButton()}
            <button className="exit-btn" onClick={onLeaveGame}>
              Opuść grę
            </button>
          </div>
        </div>
      )}
      
      {/* Canvas gry - pokazuj tylko gdy gracz żyje */}
      {playerView && !isPlayerDead && (
        <Canvas
          ref={canvasRef}
          playerView={playerView}
          onMouseMove={handleMouseMove}
        />
      )}
      
      {/* Ekran śmierci */}
      {isPlayerDead && (
        <div className="death-overlay">
          <div className="death-content">
            <h1>Koniec gry!</h1>
            <p className="death-reason">{deathReason}</p>
            <p>Straciłeś cały swój SOL!</p>
            <button 
              className="leave-btn" 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Powrót do menu');
                // Wyczyść wszystko
                localStorage.removeItem('dotara_io_game_state');
                localStorage.removeItem('dotara_io_pending_cashout');
                // Użyj onLeaveGame lub wymuś przekierowanie
                try {
                  onLeaveGame();
                } catch (error) {
                  console.error('Błąd opuszczania gry:', error);
                  window.location.href = '/';
                }
              }}
            >
              Powrót do menu
            </button>
          </div>
        </div>
      )}
      
      {/* Modal wypłaty */}
      {showCashOutModal && playerView?.player && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Potwierdź wypłatę</h2>
            <div className="cash-out-info">
              <div className="info-row">
                <span>Aktualna wartość:</span>
                <span>{formatSol(playerView.player.solValue)} SOL</span>
              </div>
              <div className="info-row">
                <span>Prowizja platformy (5%):</span>
                <span>{formatSol(playerView.player.solValue * 0.05)} SOL</span>
              </div>
              <div className="info-row highlight">
                <span>Otrzymasz:</span>
                <span>{formatSol(playerView.player.solValue * 0.95)} SOL</span>
              </div>
            </div>
            <p className="warning">
              Czy na pewno chcesz wypłacić i opuścić grę?
            </p>
            <div className="modal-buttons">
              <button 
                className="cancel-btn"
                onClick={() => setShowCashOutModal(false)}
                disabled={isCashingOut}
              >
                Anuluj
              </button>
              <button 
                className="confirm-btn"
                onClick={confirmCashOut}
                disabled={isCashingOut}
              >
                {isCashingOut ? 'Przetwarzanie...' : 'Potwierdź wypłatę'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}