import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, set } from 'firebase/database';
import { db } from '../firebase-config';
import { v4 as uuidv4 } from 'uuid';

function Home() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState('');

  const createGame = async (gameType) => {
    if (!playerName) {
      alert('Please enter your name');
      return;
    }

    const gameId = uuidv4();
    const gameRef = ref(db, `games/${gameId}`);
    
    await set(gameRef, {
      type: gameType,
      status: 'waiting',
      players: {
        [playerName]: {
          isHost: true,
          ready: false,
          score: 1000
        }
      },
      createdAt: Date.now()
    });

    navigate(`/game/${gameId}`, { state: { playerName } });
  };

  return (
    <div>
      <input
        type="text"
        placeholder="Enter your name"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
      />
      <h2>Select a Game:</h2>
      <button onClick={() => createGame('coinflip')}>
        Coin Flip Challenge
      </button>
      <button onClick={() => createGame('rps')}>
        Rock Paper Scissors
      </button>
    </div>
  );
}

export default Home; 