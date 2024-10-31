import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { ref, onValue, update, get } from 'firebase/database';
import { db } from '../firebase-config';

function GameRoom() {
  const { gameId } = useParams();
  const location = useLocation();
  const [game, setGame] = useState(null);
  const [playerName, setPlayerName] = useState(location.state?.playerName || '');
  const [bet, setBet] = useState(100);
  const [choice, setChoice] = useState('heads');
  const [rpsChoice, setRpsChoice] = useState(null);
  const [roundResult, setRoundResult] = useState(null);

  useEffect(() => {
    const gameRef = ref(db, `games/${gameId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const gameData = snapshot.val();
      console.log('Game data updated:', gameData);
      setGame(gameData);
    });

    return () => unsubscribe();
  }, [gameId]);

  const joinGame = async () => {
    if (!playerName) {
      alert('Please enter your name');
      return;
    }

    // Check if player already exists
    if (game.players[playerName]) {
      return; // Player already in game
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
    
    const players = Object.keys(game.players);
    const updates = {};
    players.forEach(player => {
      const currentScore = game.players[player].score;
      updates[`/games/${gameId}/players/${player}/score`] = 
        currentScore + (player === playerName ? (won ? bet : -bet) : 0);
    });

    await update(ref(db), updates);
  };

  const playRPSRound = async () => {
    if (!rpsChoice) {
      alert('Please make a choice!');
      return;
    }

    // First update the current player's choice and ready status
    const updates = {};
    updates[`/games/${gameId}/players/${playerName}/choice`] = rpsChoice;
    updates[`/games/${gameId}/players/${playerName}/ready`] = true;
    
    try {
      await update(ref(db), updates);
      console.log(`Updated choice for ${playerName} to ${rpsChoice}`);
      
      // Get fresh data after update
      const gameRef = ref(db, `games/${gameId}`);
      const snapshot = await get(gameRef);
      const currentGame = snapshot.val();
      
      const allPlayers = Object.entries(currentGame.players);
      console.log('Current game state:', currentGame);
      console.log('All players after update:', allPlayers.map(([name, data]) => ({
        name,
        ready: data.ready,
        choice: data.choice
      })));

      // Check if both players have made their choices
      if (allPlayers.length === 2 && allPlayers.every(([_, data]) => data.ready && data.choice)) {
        console.log('Both players ready, calculating result');
        const [player1, player2] = allPlayers;
        const result = determineWinner(
          { name: player1[0], choice: player1[1].choice },
          { name: player2[0], choice: player2[1].choice }
        );
        
        // Update scores and reset choices
        const roundUpdates = {};
        if (result !== 'tie') {
          allPlayers.forEach(([player, data]) => {
            const currentScore = data.score;
            roundUpdates[`/games/${gameId}/players/${player}/score`] = 
              currentScore + (player === result ? 50 : -50);
          });
        }
        
        // Reset for next round
        allPlayers.forEach(([player]) => {
          roundUpdates[`/games/${gameId}/players/${player}/choice`] = null;
          roundUpdates[`/games/${gameId}/players/${player}/ready`] = false;
        });
        
        setRoundResult(result);
        await update(ref(db), roundUpdates);
      }
    } catch (error) {
      console.error('Error updating game:', error);
    }
  };

  const determineWinner = (player1, player2) => {
    if (player1.choice === player2.choice) return 'tie';
    
    const rules = {
      rock: 'scissors',
      paper: 'rock',
      scissors: 'paper'
    };
    
    return rules[player1.choice] === player2.choice ? player1.name : player2.name;
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

      {game.players[playerName] && game.type === 'rps' && (
        <div>
          <h3>Players:</h3>
          {Object.entries(game.players).map(([name, data]) => (
            <div key={name}>
              {name}: {data.score} points
              {data.isHost && " (Host)"}
              {data.ready && " (Ready)"}
            </div>
          ))}

          {!game.players[playerName].ready && (
            <div>
              <h4>Make your choice:</h4>
              <button 
                onClick={() => setRpsChoice('rock')}
                className={rpsChoice === 'rock' ? 'selected' : ''}
              >
                Rock ✊
              </button>
              <button 
                onClick={() => setRpsChoice('paper')}
                className={rpsChoice === 'paper' ? 'selected' : ''}
              >
                Paper ✋
              </button>
              <button 
                onClick={() => setRpsChoice('scissors')}
                className={rpsChoice === 'scissors' ? 'selected' : ''}
              >
                Scissors ✌️
              </button>
              <button onClick={playRPSRound}>Confirm Choice</button>
            </div>
          )}

          {game.players[playerName].ready && (
            <div>Waiting for other player...</div>
          )}

          {roundResult && (
            <div>
              {roundResult === 'tie' 
                ? "It's a tie!" 
                : `${roundResult} wins this round!`}
            </div>
          )}
        </div>
      )}

      {game.players[playerName] && game.type === 'coinflip' && (
        <div>
          <h3>Players:</h3>
          {Object.entries(game.players).map(([name, data]) => (
            <div key={name}>
              {name}: {data.score} coins
              {data.isHost && " (Host)"}
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