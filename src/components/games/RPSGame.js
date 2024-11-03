import { useState, useEffect } from 'react';
import { update, ref, get } from 'firebase/database';
import { db } from '../../firebase-config';
import { determineWinner } from '../../utils/gameUtils';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../LoadingSpinner';

function RPSGame({ game, gameId, playerName }) {
  const [rpsChoice, setRpsChoice] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useNavigate();

  const isHost = game.players[playerName]?.isHost;
  const playerCount = Object.keys(game.players || {}).length;

  useEffect(() => {
    if (game?.roundResult) {
      setGameResult(game.roundResult);
      setShowResult(true);
    } else {
      setShowResult(false);
      setGameResult(null);
    }
  }, [game?.roundResult]);

  useEffect(() => {
    if (playerCount > 2) {
      const playerJoinTime = game.players[playerName]?.joinedAt || Date.now();
      const isLatestPlayer = Object.values(game.players).every(
        p => (p.joinedAt || 0) <= playerJoinTime
      );
      
      if (isLatestPlayer) {
        alert('Game is full!');
        navigate('/');
      }
    }
  }, [playerCount, playerName, game.players]);

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
        handleRoundComplete(allPlayers);
      }
    } catch (error) {
      console.error('Error updating game:', error);
    }
  };

  const handleRoundComplete = async (allPlayers) => {
    const [player1, player2] = allPlayers;
    const result = determineWinner(
      { name: player1[0], choice: player1[1].choice },
      { name: player2[0], choice: player2[1].choice }
    );
    
    await update(ref(db), {
      [`/games/${gameId}/roundResult`]: {
        winner: result,
        player1: { name: player1[0], choice: player1[1].choice },
        player2: { name: player2[0], choice: player2[1].choice }
      }
    });

    setTimeout(() => resetRound(allPlayers, result), 3000);
  };

  const resetRound = async (allPlayers, result) => {
    const roundUpdates = {};
    if (result !== 'tie') {
      allPlayers.forEach(([player, data]) => {
        const currentScore = data.score || 0;
        roundUpdates[`/games/${gameId}/players/${player}/score`] = 
          currentScore + (player === result ? 50 : -50);
      });
    }
    
    allPlayers.forEach(([player]) => {
      roundUpdates[`/games/${gameId}/players/${player}/choice`] = null;
      roundUpdates[`/games/${gameId}/players/${player}/ready`] = false;
    });
    roundUpdates[`/games/${gameId}/roundResult`] = null;
    
    await update(ref(db), roundUpdates);
    setRpsChoice(null);
  };

  const startGame = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const updates = {
        [`/games/${gameId}/status`]: 'active',
        [`/games/${gameId}/startTime`]: Date.now(),
        [`/games/${gameId}/lastUpdated`]: Date.now()
      };
      
      Object.keys(game.players).forEach(player => {
        updates[`/games/${gameId}/players/${player}/choice`] = null;
        updates[`/games/${gameId}/players/${player}/ready`] = false;
        updates[`/games/${gameId}/players/${player}/score`] = 0;
      });
      
      await update(ref(db), updates);
    } catch (error) {
      console.error('Error starting game:', error);
      setError('Failed to start game. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!game.status || game.status === 'waiting') {
    return (
      <div className="rps-game">
        <h3>Rock Paper Scissors</h3>
        <div className="lobby-info">
          <h4>Players in Lobby ({playerCount}/2)</h4>
          <div className="players-grid">
            {Object.entries(game.players).map(([name, data]) => (
              <div key={name} className="player-card">
                <div className="player-info">
                  <span className="player-name">{name}</span>
                  {data.score && <span className="player-score">{data.score} coins</span>}
                </div>
                {data.isHost && <span className="host-badge">Host</span>}
              </div>
            ))}
          </div>
        </div>
        
        {isHost ? (
          <button 
            onClick={startGame} 
            className="start-button"
            disabled={playerCount < 2}
          >
            {playerCount < 2 ? 'Waiting for Players...' : 'Start Game'}
          </button>
        ) : (
          <div className="waiting-message">
            Waiting for host to start the game...
          </div>
        )}
        
        {error && <div className="error-message">{error}</div>}
      </div>
    );
  }

  return (
    <div className="rps-game">
      <h3>Rock Paper Scissors</h3>
      <div className="players-section">
        <div className="players-grid">
          {Object.entries(game.players).map(([name, data]) => (
            <div key={name} className={`player-card ${name === playerName ? 'current-player' : ''}`}>
              <div className="player-info">
                <span className="player-name">{name}</span>
                <span className="player-score">{data.score} coins</span>
              </div>
              <div className="player-status">
                {data.ready && <span className="ready-status">Ready</span>}
                {data.isHost && <span className="host-badge">Host</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="rps-controls">
        <div className="choice-buttons">
          {['rock', 'paper', 'scissors'].map((choice) => (
            <button
              key={choice}
              className={`choice-btn ${rpsChoice === choice ? 'selected' : ''}`}
              onClick={() => setRpsChoice(choice)}
              disabled={game.players[playerName]?.ready}
            >
              <span className="choice-icon">
                {choice === 'rock' ? '✊' : choice === 'paper' ? '✋' : '✌️'}
              </span>
              <span className="choice-text">{choice}</span>
            </button>
          ))}
        </div>
        
        <button
          className="play-button"
          onClick={playRPSRound}
          disabled={!rpsChoice || game.players[playerName]?.ready}
        >
          {game.players[playerName]?.ready ? 'Waiting for opponent...' : 'Play'}
        </button>
      </div>

      {showResult && gameResult && (
        <div className="game-result">
          <div className="result-content">
            <div className="player-choice">
              <span className="choice-icon large">
                {gameResult.player1.choice === 'rock' ? '✊' : 
                 gameResult.player1.choice === 'paper' ? '✋' : '✌️'}
              </span>
              <span>{gameResult.player1.name}</span>
            </div>
            <div className="vs">VS</div>
            <div className="player-choice">
              <span className="choice-icon large">
                {gameResult.player2.choice === 'rock' ? '✊' : 
                 gameResult.player2.choice === 'paper' ? '✋' : '✌️'}
              </span>
              <span>{gameResult.player2.name}</span>
            </div>
            <div className="result-message">
              {gameResult.winner === 'tie' ? "It's a tie!" :
               gameResult.winner === playerName ? 'You won! 🎉' : 'You lost...'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RPSGame; 