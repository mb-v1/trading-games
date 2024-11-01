import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, set } from 'firebase/database';
import { db } from '../firebase-config';
import { v4 as uuidv4 } from 'uuid';

function Home() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState(() => {
    return localStorage.getItem('playerName') || '';
  });
  const [isCreating, setIsCreating] = useState(false);

  const games = [
    {
      id: 'coinflip',
      title: 'Coin Flip Challenge',
      description: 'Test your luck! Bet on heads or tails and double your coins.',
      icon: '🎲',
      minPlayers: 1,
      maxPlayers: 4
    },
    {
      id: 'rps',
      title: 'Rock Paper Scissors',
      description: 'Classic game of strategy. Challenge other players and climb the leaderboard!',
      icon: '✌️',
      minPlayers: 2,
      maxPlayers: 2
    },
    {
      id: 'multiplication',
      title: 'Speed Math Challenge',
      description: 'Race against others to solve multiplication problems. Test your mental math skills!',
      icon: '🧮',
      minPlayers: 2,
      maxPlayers: 4
    }
  ];

  const createGame = async (gameType) => {
    if (!playerName?.trim()) {
      showToast('Please enter your name');
      return;
    }

    setIsCreating(true);
    try {
      const gameId = uuidv4();
      const gameRef = ref(db, `games/${gameId}`);
      
      await set(gameRef, {
        type: gameType,
        status: 'waiting',
        players: {
          [playerName]: {
            isHost: true,
            ready: false,
            score: 1000,
            joinedAt: Date.now()
          }
        },
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        settings: {
          maxPlayers: games.find(g => g.id === gameType).maxPlayers,
          timeLimit: 300 // 5 minutes per game
        }
      });

      navigate(`game/${gameId}?type=${gameType}`, { state: { playerName } });
    } catch (error) {
      console.error('Error creating game:', error);
      showToast('Failed to create game. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const showToast = (message) => {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  const handleNameChange = (e) => {
    const newName = e.target.value;
    setPlayerName(newName);
    localStorage.setItem('playerName', newName);
  };

  return (
    <div className="game-container fade-in">
      <div className="join-container">
        <input
          type="text"
          placeholder="Enter username"
          value={playerName}
          onChange={handleNameChange}
          maxLength={20}
          disabled={isCreating}
          className="username-input"
        />
      </div>
      <div className="games-grid">
        {games.map(game => (
          <div key={game.id} className="game-card">
            <div className="game-icon">{game.icon}</div>
            <h3>{game.title}</h3>
            <p>{game.description}</p>
            <div className="game-info">
              <span>👥 {game.minPlayers}-{game.maxPlayers} Players</span>
              <span>🎮 Real-time Trading</span>
            </div>
            <button 
              onClick={() => createGame(game.id)}
              disabled={isCreating}
              className="create-game-btn"
            >
              {isCreating ? 'Creating Game...' : 'Start Trading'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Home; 