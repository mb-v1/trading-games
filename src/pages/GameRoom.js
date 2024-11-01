import { useState, useEffect } from 'react';
import { useParams, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, get, set } from 'firebase/database';
import { db } from '../firebase-config';
import CoinFlipGame from '../components/games/CoinFlipGame';
import RPSGame from '../components/games/RPSGame';
import MultiplicationGame from '../components/games/MultiplicationGame';

function GameRoom() {
  const { gameId } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [game, setGame] = useState(null);
  const [playerName, setPlayerName] = useState(() => {
    return location.state?.playerName || localStorage.getItem('playerName') || '';
  });
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const gameRef = ref(db, `games/${gameId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const gameData = snapshot.val();
      setIsLoading(false);
      if (!gameData) {
        const gameType = searchParams.get('type');
        if (gameType) {
          set(gameRef, {
            type: gameType,
            status: 'waiting',
            players: {},
            roundResult: null,
            lastUpdated: Date.now()
          });
        } else {
          console.error('Invalid game type');
        }
      } else {
        setGame(gameData);
      }
    });

    return () => unsubscribe();
  }, [gameId, searchParams]);

  const joinGame = async () => {
    if (!playerName?.trim()) {
      alert('Please enter your name');
      return;
    }

    localStorage.setItem('playerName', playerName.trim());

    try {
      const gameRef = ref(db, `games/${gameId}`);
      const snapshot = await get(gameRef);
      const gameData = snapshot.val();

      if (!gameData) {
        alert('Game not found');
        return;
      }

      if (gameData.players && Object.keys(gameData.players).length >= 2) {
        alert('Game is full');
        return;
      }

      const updates = {
        [`/games/${gameId}/players/${playerName}`]: {
          isHost: false,
          ready: false,
          score: 1000,
          joinedAt: Date.now()
        },
        [`/games/${gameId}/lastUpdated`]: Date.now()
      };

      await update(ref(db), updates);
    } catch (error) {
      console.error('Error joining game:', error);
      alert('Failed to join game. Please try again.');
    }
  };

  const handleNameChange = (e) => {
    const newName = e.target.value;
    setPlayerName(newName);
    localStorage.setItem('playerName', newName);
  };

  useEffect(() => {
    console.log('Stored player name:', localStorage.getItem('playerName'));
  }, []);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!game) {
    return <div>Game not found</div>;
  }

  return (
    <div className="game-container">
      {!game.players?.[playerName] && (
        <div className="join-container">
          <input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={handleNameChange}
          />
          <button onClick={joinGame}>Join Game</button>
        </div>
      )}

      {game.players?.[playerName] && game.type === 'coinflip' && (
        <CoinFlipGame 
          game={game} 
          gameId={gameId} 
          playerName={playerName} 
        />
      )}

      {game.players?.[playerName] && game.type === 'rps' && (
        <RPSGame 
          game={game} 
          gameId={gameId} 
          playerName={playerName}
        />
      )}

      {game.players?.[playerName] && game.type === 'multiplication' && (
        <MultiplicationGame 
          game={game} 
          gameId={gameId} 
          playerName={playerName}
        />
      )}
    </div>
  );
}

export default GameRoom; 