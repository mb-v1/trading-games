import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../firebase-config';

function GameRoom() {
  const { gameId } = useParams();
  const [game, setGame] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [bet, setBet] = useState(100);
  const [choice, setChoice] = useState('heads');

  useEffect(() => {
    const gameRef = ref(db, `games/${gameId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      setGame(snapshot.val());
    });

    return () => unsubscribe();
  }, [gameId]);

  const joinGame = async () => {
    if (!playerName) {
      alert('Please enter your name');
      return;
    }

    const updates = {};
    updates[`/games/${gameId}/players/${playerName}`] = {
      isHost: false,
      ready: false,
      score: 1000
    };

    await update(ref(db), updates);
  };

  const playRound = async () => {
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = choice === result;
    
    // Update scores
    const players = Object.keys(game.players);
    const updates = {};
    players.forEach(player => {
      const currentScore = game.players[player].score;
      updates[`/games/${gameId}/players/${player}/score`] = 
        currentScore + (player === playerName ? (won ? bet : -bet) : 0);
    });

    await update(ref(db), updates);
  };

  if (!game) return <div>Loading...</div>;

  return (
    <div>
      <h2>Game Room: {gameId}</h2>
      
      {!game.players[playerName] && (
        <div>
          <input
            type="text"
            placeholder="Enter your name to join"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <button onClick={joinGame}>Join Game</button>
        </div>
      )}

      {game.players[playerName] && (
        <div>
          <h3>Players:</h3>
          {Object.entries(game.players).map(([name, data]) => (
            <div key={name}>
              {name}: {data.score} coins
            </div>
          ))}

          <div>
            <input
              type="number"
              value={bet}
              onChange={(e) => setBet(Number(e.target.value))}
            />
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="heads">Heads</option>
              <option value="tails">Tails</option>
            </select>
            <button onClick={playRound}>Flip Coin</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GameRoom; 