import { useState, useEffect } from 'react';
import { update, ref } from 'firebase/database';
import { db } from '../../firebase-config';
import LoadingSpinner from '../LoadingSpinner';

function MultiplicationGame({ game, gameId, playerName }) {
  const [settings, setSettings] = useState({
    digit1: 1,
    digit2: 1,
    numberOfProblems: 5
  });
  const [problems, setProblems] = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [error, setError] = useState(null);

  const isHost = game.players[playerName]?.isHost;

  useEffect(() => {
    if (game.problems) {
      setProblems(game.problems);
      if (game.status === 'active' && !gameStarted) {
        setGameStarted(true);
        setStartTime(game.startTime);
      }
    }
  }, [game.problems, game.status]);

  useEffect(() => {
    if (gameStarted && !game.players[playerName]?.completed) {
      const timerInterval = setInterval(() => {
        if (startTime) {
          setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
        }
      }, 100);

      return () => clearInterval(timerInterval);
    }
  }, [gameStarted, game.players, playerName, startTime]);

  useEffect(() => {
    if (game.status === 'active' && game.startTime) {
      setCurrentProblemIndex(0);
      setCurrentAnswer('');
      setGameStarted(true);
      setElapsedTime(0);
      setStartTime(game.startTime);
    }
  }, [game.status, game.startTime]);

  const generateProblems = () => {
    const newProblems = [];
    for (let i = 0; i < settings.numberOfProblems; i++) {
      const num1 = Math.floor(Math.random() * (10 ** settings.digit1 - 2)) + 2;
      const num2 = Math.floor(Math.random() * (10 ** settings.digit2 - 2)) + 2;
      newProblems.push({
        num1,
        num2,
        answer: num1 * num2
      });
    }
    return newProblems;
  };

  const startGame = async () => {
    const problems = generateProblems();
    const updates = {
      [`/games/${gameId}/problems`]: problems,
      [`/games/${gameId}/status`]: 'active',
      [`/games/${gameId}/startTime`]: Date.now()
    };
    
    // Reset all players' progress
    Object.keys(game.players).forEach(player => {
      updates[`/games/${gameId}/players/${player}/completed`] = false;
      updates[`/games/${gameId}/players/${player}/currentProblem`] = 0;
      updates[`/games/${gameId}/players/${player}/finishTime`] = null;
    });
    
    await update(ref(db), updates);
  };

  const handleAnswer = async (value) => {
    const answer = parseInt(value);
    if (!isNaN(answer) && answer === problems[currentProblemIndex].answer) {
      if (currentProblemIndex === problems.length - 1) {
        // Game completed
        const finishTime = Date.now() - game.startTime;
        await update(ref(db), {
          [`/games/${gameId}/players/${playerName}/completed`]: true,
          [`/games/${gameId}/players/${playerName}/finishTime`]: finishTime,
          [`/games/${gameId}/players/${playerName}/currentProblem`]: problems.length
        });
      } else {
        const nextProblem = currentProblemIndex + 1;
        setCurrentProblemIndex(nextProblem);
        await update(ref(db), {
          [`/games/${gameId}/players/${playerName}/currentProblem`]: nextProblem
        });
      }
      setCurrentAnswer('');
    }
  };

  const updateGameSettings = (setting, value) => {
    let validatedValue = parseInt(value);
    if (setting.includes('digit')) {
      validatedValue = Math.min(Math.max(1, validatedValue), 3); // Max 3 digits
    } else if (setting === 'numberOfProblems') {
      validatedValue = Math.min(Math.max(1, validatedValue), 100); // Max 100 problems, min 1
    }
    
    setSettings(prev => ({
      ...prev,
      [setting]: validatedValue
    }));
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const resetGame = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Start countdown
      setCountdown(3);
      for (let i = 2; i >= 0; i--) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        setCountdown(i);
      }

      const problems = generateProblems();
      
      // Reset in a single transaction
      const updates = {
        [`/games/${gameId}/problems`]: problems,
        [`/games/${gameId}/status`]: 'waiting',
        [`/games/${gameId}/startTime`]: null,
        [`/games/${gameId}/lastUpdated`]: Date.now()
      };
      
      // Reset all players
      Object.keys(game.players).forEach(player => {
        updates[`/games/${gameId}/players/${player}/completed`] = false;
        updates[`/games/${gameId}/players/${player}/currentProblem`] = 0;
        updates[`/games/${gameId}/players/${player}/finishTime`] = null;
        updates[`/games/${gameId}/players/${player}/ready`] = false;
      });
      
      await update(ref(db), updates);
      
      // Short delay before starting new game
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Start new game
      await update(ref(db), {
        [`/games/${gameId}/status`]: 'active',
        [`/games/${gameId}/startTime`]: Date.now()
      });

    } catch (error) {
      console.error('Error resetting game:', error);
      setError('Failed to reset game. Please try again.');
    } finally {
      setIsLoading(false);
      setCountdown(null);
    }
  };

  const markPlayerReady = async () => {
    try {
      await update(ref(db), {
        [`/games/${gameId}/players/${playerName}/ready`]: true
      });

      // Check if all players are ready
      const allPlayersReady = Object.values(game.players).every(player => player.ready);
      if (allPlayersReady) {
        await resetGame();
      }
    } catch (error) {
      console.error('Error marking player ready:', error);
      setError('Failed to mark as ready. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="game-loading">
        <LoadingSpinner />
        {countdown !== null && (
          <div className="countdown">
            <h2>New Game Starting in...</h2>
            <div className="countdown-number">{countdown}</div>
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-message">
        <p>{error}</p>
        <button onClick={() => setError(null)} className="retry-button">
          Try Again
        </button>
      </div>
    );
  }

  if (!gameStarted && game.status === 'waiting' && game.problems) {
    return (
      <div className="multiplication-game">
        <h3>Multiplication Challenge</h3>
        <div className="waiting-message">
          Get ready for the next round...
        </div>
      </div>
    );
  }

  if (!gameStarted && isHost) {
    return (
      <div className="multiplication-game">
        <h3>Multiplication Challenge</h3>
        <div className="lobby-info">
          <h4>Players in Lobby ({Object.keys(game.players).length})</h4>
          <div className="players-grid">
            {Object.entries(game.players).map(([name, data]) => (
              <div key={name} className="player-card">
                <div className="player-info">
                  <span className="player-name">{name}</span>
                </div>
                {data.isHost && <span className="host-badge">Host</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="game-settings">
          <div className="setting-group">
            <label>First Number Digits:</label>
            <input
              type="number"
              min="1"
              max="3"
              value={settings.digit1}
              onChange={(e) => updateGameSettings('digit1', e.target.value)}
              className="settings-input"
            />
            <span className="setting-hint">Range: {settings.digit1 === 1 ? '2-9' : 
              settings.digit1 === 2 ? '2-99' : '2-999'}</span>
          </div>
          <div className="setting-group">
            <label>Second Number Digits:</label>
            <input
              type="number"
              min="1"
              max="3"
              value={settings.digit2}
              onChange={(e) => updateGameSettings('digit2', e.target.value)}
              className="settings-input"
            />
            <span className="setting-hint">Range: {settings.digit2 === 1 ? '2-9' : 
              settings.digit2 === 2 ? '2-99' : '2-999'}</span>
          </div>
          <div className="setting-group">
            <label>Number of Problems:</label>
            <input
              type="number"
              min="1"
              max="100"
              value={settings.numberOfProblems}
              onChange={(e) => updateGameSettings('numberOfProblems', e.target.value)}
              className="settings-input"
            />
            <span className="setting-hint">Between 1-100 problems</span>
          </div>
          <button 
            onClick={startGame} 
            className="start-button"
            disabled={Object.keys(game.players).length < 2}
          >
            {Object.keys(game.players).length < 2 
              ? 'Waiting for Players...' 
              : 'Start Game'}
          </button>
        </div>
      </div>
    );
  }

  if (!gameStarted) {
    return (
      <div className="multiplication-game">
        <h3>Multiplication Challenge</h3>
        <div className="lobby-info">
          <h4>Players in Lobby ({Object.keys(game.players).length})</h4>
          <div className="players-grid">
            {Object.entries(game.players).map(([name, data]) => (
              <div key={name} className="player-card">
                <div className="player-info">
                  <span className="player-name">{name}</span>
                </div>
                {data.isHost && <span className="host-badge">Host</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="waiting-message">
          Waiting for host to start the game...
        </div>
      </div>
    );
  }

  return (
    <div className="multiplication-game">
      <h3>Multiplication Challenge</h3>
      
      {game.players[playerName]?.completed ? (
        <div className="completion-message">
          <h4>You've completed all problems!</h4>
          <div className="results-section">
            <h5>Results:</h5>
            {Object.entries(game.players)
              .sort((a, b) => (a[1].finishTime || Infinity) - (b[1].finishTime || Infinity))
              .map(([name, data], index) => (
                <div key={name} className={`result-card ${name === playerName ? 'current-player' : ''}`}>
                  <span className="position">{index + 1}</span>
                  <span className="player-name">{name}</span>
                  {data.completed ? (
                    <span className="finish-time">
                      {(data.finishTime / 1000).toFixed(1)}s
                    </span>
                  ) : (
                    <span className="still-solving">Still solving...</span>
                  )}
                </div>
              ))}
          </div>
          {isHost && game.status !== 'waiting' && (
            <div className="game-actions">
              <button 
                onClick={resetGame}
                className="play-again-button"
              >
                Play Again
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="problem-section">
          <div className="timer">Time: {formatTime(elapsedTime)}</div>
          <div className="problem">
            {problems[currentProblemIndex]?.num1} × {problems[currentProblemIndex]?.num2} = ?
          </div>
          <input
            type="number"
            value={currentAnswer}
            onChange={(e) => {
              setCurrentAnswer(e.target.value);
              handleAnswer(e.target.value);
            }}
            placeholder="Enter your answer"
            autoFocus
            className="answer-input"
          />
          <div className="progress">
            Problem {currentProblemIndex + 1} of {problems.length}
          </div>
        </div>
      )}

      <div className="players-section">
        {Object.entries(game.players).map(([name, data]) => (
          <div key={name} className={`player-card ${name === playerName ? 'current-player' : ''}`}>
            <div className="player-info">
              <span className="player-name">{name}</span>
              {data.completed ? (
                <span className="completion-time">
                  {(data.finishTime / 1000).toFixed(1)}s
                </span>
              ) : (
                <span className="solving-status">
                  Problem {(data.currentProblem || 0) + 1}/{problems.length}
                </span>
              )}
            </div>
            {data.completed && <span className="completed-badge">Completed!</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MultiplicationGame; 