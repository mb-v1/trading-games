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
  const [gameResult, setGameResult] = useState(null);
  const [showResult, setShowResult] = useState(false);

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
        
        setGameResult({
          winner: result,
          player1: { name: player1[0], choice: player1[1].choice },
          player2: { name: player2[0], choice: player2[1].choice }
        });
        setShowResult(true);

        setTimeout(async () => {
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
          setShowResult(false);
          setGameResult(null);
          setRpsChoice(null);
        }, 3000);
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

  const getResultMessage = (result) => {
    if (!result) return '';
    if (result.winner === 'tie') return "It's a tie!";
    return result.winner === playerName ? 'You won! 🎉' : 'You lost...';
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
        <div className="rps-game">
          <div className="players-section">
            <h3>Players</h3>
            <div className="players-grid">
              {Object.entries(game.players).map(([name, data]) => (
                <div key={name} className={`player-card ${name === playerName ? 'current-player' : ''}`}>
                  <div className="player-info">
                    <span className="player-name">{name}</span>
                    <span className="player-score">{data.score} points</span>
                  </div>
                  <div className="player-status">
                    {data.ready && <span className="ready-status">Ready ✓</span>}
                    {data.isHost && <span className="host-badge">Host</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {showResult && gameResult && (
            <div className="game-result">
              <div className="result-content">
                <div className="player-choice">
                  <span className="choice-icon large">{
                    gameResult.player1.choice === 'rock' ? '🪨' :
                    gameResult.player1.choice === 'paper' ? '📄' : '✂️'
                  }</span>
                  <span className="player-name">{gameResult.player1.name}</span>
                </div>
                <div className="vs">VS</div>
                <div className="player-choice">
                  <span className="choice-icon large">{
                    gameResult.player2.choice === 'rock' ? '🪨' :
                    gameResult.player2.choice === 'paper' ? '📄' : '✂️'
                  }</span>
                  <span className="player-name">{gameResult.player2.name}</span>
                </div>
                <div className="result-message">{getResultMessage(gameResult)}</div>
              </div>
            </div>
          )}

          <div className="rps-controls">
            <h3>Make Your Choice</h3>
            <div className="choice-buttons">
              <button 
                className={`choice-btn ${rpsChoice === 'rock' ? 'selected' : ''}`}
                onClick={() => setRpsChoice('rock')}
                disabled={game.players[playerName].ready}
              >
                <span className="choice-icon">🪨</span>
                <span className="choice-text">Rock</span>
              </button>
              <button 
                className={`choice-btn ${rpsChoice === 'paper' ? 'selected' : ''}`}
                onClick={() => setRpsChoice('paper')}
                disabled={game.players[playerName].ready}
              >
                <span className="choice-icon">📄</span>
                <span className="choice-text">Paper</span>
              </button>
              <button 
                className={`choice-btn ${rpsChoice === 'scissors' ? 'selected' : ''}`}
                onClick={() => setRpsChoice('scissors')}
                disabled={game.players[playerName].ready}
              >
                <span className="choice-icon">✂️</span>
                <span className="choice-text">Scissors</span>
              </button>
            </div>
            <button 
              className="play-button"
              onClick={playRPSRound}
              disabled={!rpsChoice || game.players[playerName].ready}
            >
              {game.players[playerName].ready ? 'Waiting for opponent...' : 'Confirm Choice'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default GameRoom; 