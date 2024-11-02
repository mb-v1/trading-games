import { useState, useEffect } from 'react';
import { useParams, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, get, set } from 'firebase/database';
import { db } from '../firebase-config';
import CoinFlipGame from '../components/games/CoinFlipGame';
import RPSGame from '../components/games/RPSGame';
import MultiplicationGame from '../components/games/MultiplicationGame';
import LiarsDiceGame from '../components/games/LiarsDiceGame';
import { rollDice } from '../utils/gameUtils';

function GameRoom() {
  const { gameId } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [playerName, setPlayerName] = useState(() => {
    return location.state?.playerName || localStorage.getItem('playerName') || '';
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const initializeGame = async (gameType) => {
    try {
      const gameRef = ref(db, `games/${gameId}`);
      await set(gameRef, {
        type: gameType,
        status: 'waiting',
        players: {},
        roundResult: null,
        lastUpdated: Date.now(),
        settings: {
          maxPlayers: getMaxPlayers(gameType),
          timeLimit: 300
        }
      });
    } catch (error) {
      console.error('Error initializing game:', error);
      setError('Failed to initialize game');
      navigate('/');
    }
  };

  const getMaxPlayers = (gameType) => {
    const maxPlayers = {
      coinflip: 4,
      rps: 2,
      multiplication: 4,
      'liars-dice': 6
    };
    return maxPlayers[gameType] || 4;
  };

  const cleanupStaleGame = async () => {
    try {
      const gameRef = ref(db, `games/${gameId}`);
      await set(gameRef, null);
    } catch (error) {
      console.error('Error cleaning up stale game:', error);
    }
  };

  useEffect(() => {
    const gameRef = ref(db, `games/${gameId}`);
    setIsLoading(true);
    setError(null);

    const unsubscribe = onValue(gameRef, (snapshot) => {
      const gameData = snapshot.val();
      setIsLoading(false);

      if (!gameData) {
        const gameType = searchParams.get('type');
        if (gameType) {
          initializeGame(gameType);
        } else {
          setError('Game not found');
          navigate('/');
        }
      } else {
        // Check if game is stale (older than 24 hours)
        const isStale = Date.now() - gameData.lastUpdated > 24 * 60 * 60 * 1000;
        if (isStale) {
          cleanupStaleGame();
          setError('This game has expired');
          navigate('/');
          return;
        }

        // Check if player was disconnected
        if (playerName && gameData.players && !gameData.players[playerName]) {
          setError('You were disconnected from the game');
          navigate('/');
          return;
        }

        setGame(gameData);
      }
    }, (error) => {
      console.error('Error loading game:', error);
      setError('Failed to load game');
      setIsLoading(false);
      navigate('/');
    });

    // Cleanup function
    return () => {
      unsubscribe();
      // If player is leaving, remove them from the game
      if (playerName && game?.players?.[playerName]) {
        handlePlayerLeave();
      }
    };
  }, [gameId, searchParams]);

  const handlePlayerLeave = async () => {
    try {
      const updates = {};
      updates[`/games/${gameId}/players/${playerName}`] = null;
      updates[`/games/${gameId}/lastUpdated`] = Date.now();
      
      // If this was the last player, remove the game
      const remainingPlayers = Object.keys(game.players).filter(p => p !== playerName);
      if (remainingPlayers.length === 0) {
        await cleanupStaleGame();
      } else {
        await update(ref(db), updates);
      }
    } catch (error) {
      console.error('Error handling player leave:', error);
    }
  };

  const joinGame = async () => {
    if (!playerName?.trim()) {
      setError('Please enter your name');
      return;
    }

    localStorage.setItem('playerName', playerName.trim());

    try {
      const gameRef = ref(db, `games/${gameId}`);
      const snapshot = await get(gameRef);
      const gameData = snapshot.val();

      if (!gameData) {
        setError('Game not found');
        return;
      }

      if (gameData.players && Object.keys(gameData.players).length >= gameData.settings?.maxPlayers) {
        setError('Game is full');
        return;
      }

      const updates = {
        [`/games/${gameId}/players/${playerName}`]: {
          isHost: !gameData.players || Object.keys(gameData.players).length === 0,
          ready: false,
          dice: rollDice(5),
          isActive: true,
          joinedAt: Date.now()
        },
        [`/games/${gameId}/lastUpdated`]: Date.now()
      };

      await update(ref(db), updates);
      setError(null);
    } catch (error) {
      console.error('Error joining game:', error);
      setError('Failed to join game. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loader"></div>
        <p>Loading game...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <div className="error-message">
          <h3>Error</h3>
          <p>{error}</p>
          <button onClick={() => navigate('/')} className="primary-button">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
      {!game?.players?.[playerName] && (
        <div className="join-container">
          <input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={20}
            className={error ? 'error' : ''}
          />
          <button onClick={joinGame}>Join Game</button>
          {error && <p className="error-text">{error}</p>}
        </div>
      )}

      {game?.players?.[playerName] && (
        <>
          {game.type === 'coinflip' && (
            <CoinFlipGame game={game} gameId={gameId} playerName={playerName} />
          )}
          {game.type === 'rps' && (
            <RPSGame game={game} gameId={gameId} playerName={playerName} />
          )}
          {game.type === 'multiplication' && (
            <MultiplicationGame game={game} gameId={gameId} playerName={playerName} />
          )}
          {game.type === 'liars-dice' && (
            <LiarsDiceGame game={game} gameId={gameId} playerName={playerName} />
          )}
        </>
      )}
    </div>
  );
}

export default GameRoom;