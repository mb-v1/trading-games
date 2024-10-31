import { useState, useEffect } from 'react';
import { useParams, useLocation, useSearchParams } from 'react-router-dom';
import { ref, onValue, update, get, set } from 'firebase/database';
import { db } from '../firebase-config';

function GameRoom() {
  const { gameId } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [game, setGame] = useState(null);
  const [playerName, setPlayerName] = useState(location.state?.playerName || '');
  const [bet, setBet] = useState(100);
  const [choice, setChoice] = useState('heads');
  const [rpsChoice, setRpsChoice] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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

  const playRPSRound = async () => {
    if (!game?.players?.[playerName]) {
      alert('Game state error. Please rejoin.');
      return;
    }

    if (!rpsChoice) {
      alert('Please make a choice!');
      return;
    }

    const updates = {};
    updates[`/games/${gameId}/players/${playerName}/choice`] = rpsChoice;
    updates[`/games/${gameId}/players/${playerName}/ready`] = true;
    
    try {
      await update(ref(db), updates);
      
      const gameRef = ref(db, `games/${gameId}`);
      const snapshot = await get(gameRef);
      const currentGame = snapshot.val();
      
      const allPlayers = Object.entries(currentGame.players);
      
      if (allPlayers.length === 2 && allPlayers.every(([_, data]) => data.ready && data.choice)) {
        const [player1, player2] = allPlayers;
        const result = determineWinner(
          { name: player1[0], choice: player1[1].choice },
          { name: player2[0], choice: player2[1].choice }
        );
        
        const roundUpdates = {};
        if (result !== 'tie') {
          allPlayers.forEach(([player, data]) => {
            const currentScore = data.score;
            roundUpdates[`/games/${gameId}/players/${player}/score`] = 
              currentScore + (player === result ? 50 : -50);
          });
        }
        
        allPlayers.forEach(([player]) => {
          roundUpdates[`/games/${gameId}/players/${player}/choice`] = null;
          roundUpdates[`/games/${gameId}/players/${player}/ready`] = false;
        });
        
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
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <button onClick={joinGame}>Join Game</button>
        </div>
      )}

      {game.players?.[playerName] && game.type === 'coinflip' && (
        <div>
          <h3>Players:</h3>
          {Object.entries(game.players).map(([name, data]) => (
            <div key={name}>
              {name}: {data.score} coins
              {data.isHost && " (Host)"}
            </div>
          ))}
          <div className="game-controls">
            <input
              type="number"
              value={bet}
              onChange={(e) => setBet(Number(e.target.value))}
              min="1"
            />
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="heads">Heads</option>
              <option value="tails">Tails</option>
            </select>
            <button onClick={playRound}>Play</button>
          </div>
        </div>
      )}

      {game.players?.[playerName] && game.type === 'rps' && (
        <div>
          <h3>Players:</h3>
          {Object.entries(game.players).map(([name, data]) => (
            <div key={name}>
              {name}: {data.score} points
              {data.ready && " ✓"}
              {data.isHost && " (Host)"}
            </div>
          ))}
          <div className="game-controls">
            <select value={rpsChoice || ''} onChange={(e) => setRpsChoice(e.target.value)}>
              <option value="">Choose...</option>
              <option value="rock">Rock</option>
              <option value="paper">Paper</option>
              <option value="scissors">Scissors</option>
            </select>
            <button onClick={playRPSRound}>Play</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GameRoom; 