import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, set } from 'firebase/database';
import { db } from '../firebase-config';
import { v4 as uuidv4 } from 'uuid';

function Home() {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);

  const games = [
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
    },
    {
      id: 'liars-dice',
      title: "Liar's Dice",
      description: 'A thrilling game of deception and probability. Bluff your way to victory!',
      icon: '🎲',
      minPlayers: 2,
      maxPlayers: 6
    }
  ];

  const createGame = async (gameType) => {
    setIsCreating(true);
    try {
      const gameId = uuidv4();
      
      // Create the full URL for sharing
      const baseUrl = window.location.origin + window.location.pathname;
      const gameUrl = `${baseUrl}#/game/${gameId}?type=${gameType}`;
      
      // Store the game URL for sharing
      localStorage.setItem('lastGameUrl', gameUrl);
      
      // Navigate to the game
      navigate(`/game/${gameId}?type=${gameType}`);
    } catch (error) {
      console.error('Error creating game:', error);
      alert('Failed to create game. Please try again.');
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

  return (
    <div className="game-container fade-in">
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