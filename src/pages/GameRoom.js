import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../firebase-config';
import CoinFlipGame from '../components/games/CoinFlipGame';
import RPSGame from '../components/games/RPSGame';
import MultiplicationGame from '../components/games/MultiplicationGame';
import LiarsDiceGame from '../components/games/LiarsDiceGame';
import LoadingSpinner from '../components/LoadingSpinner';

function GameRoom() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [game, setGame] = useState(null);
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('playerName') || '';
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Function to get game type from URL
  const getGameType = () => {
    const searchParams = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams(location.hash.split('?')[1] || '');
    return searchParams.get('type') || hashParams.get('type');
  };

  useEffect(() => {
    console.log('Current location:', location); // Debug log
    const gameRef = ref(db, `games/${gameId}`);
    setIsLoading(true);

    const unsubscribe = onValue(gameRef, async (snapshot) => {
      const gameData = snapshot.val();
      console.log('Game data:', gameData); // Debug log
      setIsLoading(false);

      if (!gameData) {
        const gameType = getGameType();
        console.log('Game type from URL:', gameType); // Debug log

        if (gameType) {
          try {
            await initializeGame(gameType);
          } catch (error) {
            console.error('Error initializing game:', error);
            setError('Failed to create game');
          }
        } else {
          console.log('No game type found in URL'); // Debug log
          setError('Game not found');
          navigate('/');
        }
      } else {
        // Check if game is stale (older than 24 hours)
        const isStale = Date.now() - gameData.lastUpdated > 24 * 60 * 60 * 1000;
        if (isStale) {
          await cleanupStaleGame();
          setError('This game has expired');
          navigate('/');
          return;
        }
        setGame(gameData);
      }
    }, (error) => {
      console.error('Database error:', error); // Debug log
      setError('Failed to load game');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [gameId, location, navigate]);

  const initializeGame = async (gameType) => {
    console.log('Initializing game of type:', gameType); // Debug log
    const gameRef = ref(db, `games/${gameId}`);
    const maxPlayers = {
      'coinflip': 4,
      'rps': 2,
      'multiplication': 4,
      'liars-dice': 6
    }[gameType] || 4;

    try {
      await update(ref(db), {
        [`games/${gameId}`]: {
          type: gameType,
          status: 'waiting',
          players: {},
          settings: {
            maxPlayers,
            timeLimit: 300
          },
          lastUpdated: Date.now()
        }
      });
      console.log('Game initialized successfully'); // Debug log
    } catch (error) {
      console.error('Error in initializeGame:', error); // Debug log
      throw error;
    }
  };

  const cleanupStaleGame = async () => {
    try {
      await update(ref(db), {
        [`games/${gameId}`]: null
      });
    } catch (error) {
      console.error('Error cleaning up stale game:', error);
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="Loading game..." />;
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
          <h2>Join Game</h2>
          <p>Game Type: {game?.type || getGameType()}</p>
          <input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={20}
            className={error ? 'error' : ''}
          />
          <button 
            onClick={() => {
              if (!playerName?.trim()) {
                setError('Please enter your name');
                return;
              }
              localStorage.setItem('playerName', playerName.trim());
              const updates = {};
              updates[`games/${gameId}/players/${playerName}`] = {
                isHost: !game?.players || Object.keys(game?.players || {}).length === 0,
                joinedAt: Date.now()
              };
              update(ref(db), updates);
            }}
            className="primary-button"
          >
            Join Game
          </button>
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