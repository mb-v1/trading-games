import { useState } from 'react';
import { update, ref } from 'firebase/database';
import { db } from '../../firebase-config';

function CoinFlipGame({ game, gameId, playerName }) {
  const [bet, setBet] = useState(100);
  const [choice, setChoice] = useState('heads');

  const playRound = async () => {
    if (!game?.players?.[playerName]) {
      alert('Game state error. Please rejoin.');
      return;
    }

    if (bet <= 0) {
      alert('Bet must be greater than 0');
      return;
    }

    if (bet > game.players[playerName].score) {
      alert('Insufficient coins for this bet');
      return;
    }

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = choice === result;
    
    const players = Object.keys(game.players);
    const updates = {};
    players.forEach(player => {
      const currentScore = game.players[player].score;
      updates[`/games/${gameId}/players/${player}/score`] = 
        currentScore + (player === playerName ? (won ? bet : -bet) : 0);
    });

    await update(ref(db), updates);
  };

  return (
    <div>
      <h3>Coin Flip Challenge</h3>
      <div className="players-section">
        <h4>Players:</h4>
        {Object.entries(game.players).map(([name, data]) => (
          <div key={name} className="player-card">
            <div className="player-info">
              <span className="player-name">{name}</span>
              <span className="player-score">{data.score} coins</span>
            </div>
            {data.isHost && <span className="host-badge">Host</span>}
          </div>
        ))}
      </div>
      <div className="game-controls">
        <input
          type="number"
          value={bet}
          onChange={(e) => setBet(Number(e.target.value))}
          min="1"
          className="bet-input"
        />
        <select 
          value={choice} 
          onChange={(e) => setChoice(e.target.value)}
          className="choice-select"
        >
          <option value="heads">Heads</option>
          <option value="tails">Tails</option>
        </select>
        <button onClick={playRound} className="play-button">Play</button>
      </div>
    </div>
  );
}

export default CoinFlipGame; 