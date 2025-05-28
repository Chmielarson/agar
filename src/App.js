// src/App.js
import React, { useState, useEffect, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import JoinGame from './components/JoinGame';
import Game from './components/Game';
import CashOutScreen from './components/CashOutScreen';
import './App.css';
import '@solana/wallet-adapter-react-ui/styles.css';
import io from 'socket.io-client';

const network = WalletAdapterNetwork.Devnet;
const endpoint = clusterApiUrl(network);
const wallets = [new PhantomWalletAdapter()];

function AppContent() {
  const wallet = useWallet();
  const { publicKey } = wallet;
  
  const [currentView, setCurrentView] = useState('join'); // 'join', 'game', 'cashout'
  const [playerStake, setPlayerStake] = useState(0);
  const [playerNickname, setPlayerNickname] = useState('');
  const [pendingCashOut, setPendingCashOut] = useState(null);
  const [isCheckingCashOut, setIsCheckingCashOut] = useState(true);
  
  // Initialize socket.io - use useMemo to prevent reconnection on every render
  const socket = useMemo(() => {
    const GAME_SERVER_URL = import.meta.env.VITE_GAME_SERVER_URL || 'http://localhost:3001';
    return io(GAME_SERVER_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }, []);
  
  useEffect(() => {
    return () => {
      socket.disconnect();
    };
  }, [socket]);
  
  // Check for pending cash out on mount
  useEffect(() => {
    const checkPendingCashOut = () => {
      const pendingCashOutData = localStorage.getItem('dotara_io_pending_cashout');
      
      if (pendingCashOutData && publicKey) {
        try {
          const data = JSON.parse(pendingCashOutData);
          
          if (data.playerAddress === publicKey.toString()) {
            // Gracz ma oczekującą wypłatę
            setPendingCashOut(data);
            setCurrentView('cashout');
          } else {
            // Inne konto - usuń stare dane
            localStorage.removeItem('dotara_io_pending_cashout');
          }
        } catch (error) {
          console.error('Error parsing pending cashout data:', error);
          localStorage.removeItem('dotara_io_pending_cashout');
        }
      }
      
      setIsCheckingCashOut(false);
    };
    
    if (publicKey) {
      checkPendingCashOut();
    } else {
      setIsCheckingCashOut(false);
    }
  }, [publicKey]);
  
  // Save game state
  useEffect(() => {
    if (currentView === 'game' && publicKey && playerStake > 0) {
      localStorage.setItem('dotara_io_game_state', JSON.stringify({
        playerAddress: publicKey.toString(),
        stake: playerStake,
        nickname: playerNickname
      }));
    }
  }, [currentView, publicKey, playerStake, playerNickname]);
  
  // Zarządzaj klasą body dla gry
  useEffect(() => {
    if (currentView === 'game') {
      document.body.classList.add('game-active');
    } else {
      document.body.classList.remove('game-active');
    }
    
    return () => {
      document.body.classList.remove('game-active');
    };
  }, [currentView]);
  
  const handleJoinGame = (stake, nickname) => {
    setPlayerStake(stake);
    setPlayerNickname(nickname);
    setCurrentView('game');
  };
  
  const handleLeaveGame = (hasPendingCashOut = false) => {
    if (hasPendingCashOut) {
      // Pobierz dane z localStorage od razu przy przekierowaniu
      const pendingCashOutData = localStorage.getItem('dotara_io_pending_cashout');
      if (pendingCashOutData) {
        try {
          const data = JSON.parse(pendingCashOutData);
          setPendingCashOut(data);
          setCurrentView('cashout');
        } catch (error) {
          console.error('Error loading pending cashout:', error);
          setCurrentView('join');
        }
      }
    } else {
      setCurrentView('join');
      setPlayerStake(0);
      setPlayerNickname('');
      localStorage.removeItem('dotara_io_game_state');
    }
  };
  
  const handleCashOutComplete = () => {
    setPendingCashOut(null);
    localStorage.removeItem('dotara_io_pending_cashout');
    setCurrentView('join');
    setPlayerStake(0);
    setPlayerNickname('');
  };
  
  // Nie renderuj nic podczas sprawdzania
  if (isCheckingCashOut) {
    return (
      <div className="app">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          flexDirection: 'column'
        }}>
          <div className="spinner"></div>
          <p style={{ marginTop: '20px', color: '#666' }}>Loading...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="app">
      {currentView !== 'game' && (
        <header className="app-header">
          <div className="header-content">
            <img src="/logo.png" alt="Dotara.io" className="logo" />
          </div>
          <div className="wallet-section">
            <WalletMultiButton />
            {publicKey && (
              <div className="wallet-info">
                <span className="balance">Connected</span>
              </div>
            )}
          </div>
        </header>
      )}
      
      <main className="app-main">
        {currentView === 'join' && (
          <JoinGame 
            onJoinGame={handleJoinGame}
            socket={socket}
          />
        )}
        
        {currentView === 'game' && publicKey && (
          <Game 
            key={`game-${publicKey.toString()}-${playerStake}`}
            initialStake={playerStake}
            nickname={playerNickname}
            onLeaveGame={handleLeaveGame}
            setPendingCashOut={setPendingCashOut}
            socket={socket}
          />
        )}
        
        {currentView === 'cashout' && publicKey && pendingCashOut && (
          <CashOutScreen
            pendingCashOut={pendingCashOut}
            wallet={wallet}
            onComplete={handleCashOutComplete}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AppContent />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}