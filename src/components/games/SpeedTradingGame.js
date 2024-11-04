import { useState, useEffect, useRef } from 'react';
import { update, ref, get } from 'firebase/database';
import { db } from '../../firebase-config';
import LoadingSpinner from '../LoadingSpinner';
import { useNavigate } from 'react-router-dom';

function SpeedTradingGame({ game, gameId, playerName }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [betAmount, setBetAmount] = useState('');
  const timerRef = useRef(null);
  const navigate = useNavigate();
  const betInputRef = useRef(null);

  const isHost = game.players[playerName]?.isHost;
  const currentTrade = game.currentTrade;
  const gameSettings = game.settings || {};
  const playerMoney = game.players[playerName]?.money || 0;

  const [tradeHistory, setTradeHistory] = useState([]);

  const betFee = Math.floor(((gameSettings.betFee || 1) / 100) * (gameSettings.startingMoney || 1000));

  useEffect(() => {
    if (currentTrade?.timeLeft > 0 && game.status === 'active') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      timerRef.current = setInterval(async () => {
        const timeLeft = Math.max(0, currentTrade.timeLeft - 1);
        
        if (timeLeft === 0 && !currentTrade.takenBy) {
          await update(ref(db), {
            [`/games/${gameId}/tradeHistory/${currentTrade.timestamp}`]: {
              ...currentTrade,
              timeLeft: 0
            }
          });
          clearInterval(timerRef.current);
          generateNewTrade();
        } else if (!currentTrade.takenBy) {
          await update(ref(db), {
            [`/games/${gameId}/currentTrade/timeLeft`]: timeLeft
          });
        }
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [currentTrade?.timeLeft, game.status]);

  useEffect(() => {
    if (game.tradeHistory) {
      const history = Object.entries(game.tradeHistory)
        .map(([_, trade]) => trade)
        .sort((a, b) => b.timestamp - a.timestamp);
      setTradeHistory(history);
    } else {
      setTradeHistory([]);
    }
  }, [game.tradeHistory]);

  useEffect(() => {
    if (currentTrade?.timeLeft > 0 && !currentTrade?.takenBy && betInputRef.current) {
      betInputRef.current.focus();
    }
  }, [currentTrade]);

  const startGame = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const updates = {
        [`/games/${gameId}/status`]: 'active',
        [`/games/${gameId}/currentRound`]: 1,
        [`/games/${gameId}/startTime`]: Date.now(),
        [`/games/${gameId}/lastUpdated`]: Date.now()
      };
      
      // Initialize player money and scores
      Object.keys(game.players).forEach(player => {
        updates[`/games/${gameId}/players/${player}/money`] = gameSettings.startingMoney || 1000;
        updates[`/games/${gameId}/players/${player}/trades`] = 0;
      });
      
      await update(ref(db), updates);
      generateNewTrade();
    } catch (error) {
      console.error('Error starting game:', error);
      setError('Failed to start game');
    } finally {
      setIsLoading(false);
    }
  };

  const generateNewTrade = async () => {
    try {
      if ((game.currentRound || 0) >= (gameSettings.rounds || 10)) {
        console.log('Ending game - reached final round');
        await endGame();
        return;
      }

      const tradeSnapshot = await get(ref(db, `/games/${gameId}/currentTrade`));
      const tradeToStore = tradeSnapshot.val();

      if (tradeToStore && tradeToStore.timestamp) {
        await update(ref(db), {
          [`/games/${gameId}/tradeHistory/${tradeToStore.timestamp}`]: {
            ...tradeToStore,
            timeLeft: 0
          }
        });
      }

      // Box-Muller transform for normal distribution
      const generateNormal = (mean, stdDev) => {
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        return mean + stdDev * z;
      };

      // Generate simple odds first (1-19)
      const numerator = Math.max(1, Math.min(19, Math.round(generateNormal(10, 4))));
      const denominator = Math.max(1, Math.min(19, Math.round(generateNormal(10, 4))));
      
      // Calculate theoretical fair probability based on odds
      const fairProbability = (denominator / (numerator + denominator)) * 100;
      
      // Add some variation to create opportunities
      // More variation (stdDev = 5) to create more interesting opportunities
      const probability = Math.min(95, Math.max(5, 
        Math.round(fairProbability + generateNormal(0, 5))
      ));
      
      const newTrade = {
        odds: `${numerator}:${denominator}`,
        probability,
        timeLeft: gameSettings.tradeTimeout || 10,
        takenBy: null,
        betAmount: null,
        result: null,
        timestamp: Date.now()
      };

      const nextRound = (game.currentRound || 0) + 1;
      await update(ref(db), {
        [`/games/${gameId}/currentTrade`]: newTrade,
        [`/games/${gameId}/currentRound`]: nextRound
      });
    } catch (error) {
      console.error('Error generating new trade:', error);
      setError('Failed to generate new trade');
    }
  };

  const takeTrade = async () => {
    if (!betAmount || isNaN(betAmount) || betAmount <= 0) {
      setError('Please enter a valid bet amount');
      return;
    }

    const totalCost = Number(betAmount) + betFee;

    if (totalCost > playerMoney) {
      setError(`Not enough money for bet + fee (${gameSettings.betFee}% = $${betFee})`);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const gameSnapshot = await get(ref(db, `/games/${gameId}`));
      const currentGameData = gameSnapshot.val();

      if (currentGameData.currentTrade.takenBy || currentGameData.currentTrade.timeLeft <= 0) {
        setError('Trade no longer available');
        return;
      }

      const [numerator, denominator] = currentTrade.odds.split(':').map(Number);
      const won = Math.random() * 100 < currentTrade.probability;
      const winAmount = Math.floor(won ? Number(betAmount) * (numerator / denominator) : -Number(betAmount));
      const finalAmount = Math.floor(winAmount - betFee);

      const probability = currentTrade.probability / 100;
      const odds = numerator / denominator;
      
      // Calculate EV per $1 bet (before fee)
      const evPerDollar = (probability * odds) - (1 - probability);
      // Calculate EV for actual bet amount (including fee)
      const totalEV = (evPerDollar * Number(betAmount)) - betFee;
      
      // Calculate Kelly criterion
      const kellyFraction = Math.max(0, (probability * (odds + 1) - 1) / odds);
      const kellyBet = Math.floor(playerMoney * kellyFraction);

      const updatedTrade = {
        ...currentTrade,
        takenBy: playerName,
        betAmount: Math.floor(Number(betAmount)),
        betFee: Math.floor(betFee),
        result: won ? 'win' : 'loss',
        winAmount: Math.floor(winAmount),
        finalAmount: Math.floor(finalAmount),
        playerMoneyBefore: playerMoney,
        kellyBet,
        kellyFraction: Math.round(kellyFraction * 100) / 100,
        evPerDollar: Math.round(evPerDollar * 100) / 100,
        totalEV: Math.round(totalEV * 100) / 100
      };

      await update(ref(db), {
        [`/games/${gameId}/currentTrade`]: updatedTrade,
        [`/games/${gameId}/players/${playerName}/money`]: Math.floor(playerMoney + finalAmount),
        [`/games/${gameId}/players/${playerName}/trades`]: (game.players[playerName].trades || 0) + 1,
      });

      // Store in history immediately
      await update(ref(db), {
        [`/games/${gameId}/tradeHistory/${currentTrade.timestamp}`]: updatedTrade
      });

      if ((game.currentRound || 0) >= (gameSettings.rounds || 10)) {
        console.log('Ending game after trade - final round');
        setTimeout(() => endGame(), 3000);
      } else {
        setTimeout(() => generateNewTrade(), 3000);
      }
    } catch (error) {
      console.error('Error taking trade:', error);
      setError('Failed to take trade');
    } finally {
      setIsLoading(false);
      setBetAmount('');
    }
  };

  const endGame = async () => {
    try {
      if (currentTrade) {
        await update(ref(db), {
          [`/games/${gameId}/tradeHistory/${currentTrade.timestamp}`]: currentTrade
        });
      }

      const players = Object.entries(game.players)
        .map(([name, data]) => ({ name, money: data.money, trades: data.trades }))
        .sort((a, b) => b.money - a.money);

      console.log('Updating game status to completed');
      await update(ref(db), {
        [`/games/${gameId}/status`]: 'completed',
        [`/games/${gameId}/winner`]: players[0].name,
        [`/games/${gameId}/finalStandings`]: players,
        [`/games/${gameId}/currentTrade`]: null // Clear current trade
      });
    } catch (error) {
      console.error('Error ending game:', error);
      setError('Failed to end game');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && betAmount && !isLoading) {
      takeTrade();
    }
  };

  const renderTradeCard = () => (
    <div className="trade-card">
      <div className="trade-timer">Time Left: {currentTrade.timeLeft}s</div>
      <div className="trade-details">
        <div className="trade-odds">Odds: {currentTrade.odds}</div>
        <div className="trade-probability">Win Probability: {currentTrade.probability}%</div>
      </div>
      
      {!currentTrade.takenBy && currentTrade.timeLeft > 0 ? (
        <div className="trade-actions">
          <div className="bet-fee-info">
            Bet Fee: {gameSettings.betFee || 1}% (${Math.floor(betFee)})
          </div>
          <input
            ref={betInputRef}
            type="number"
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter bet amount"
            min="1"
            max={playerMoney}
          />
          <button 
            onClick={takeTrade}
            disabled={!betAmount || isLoading}
            className="take-trade-btn"
          >
            Take Trade
          </button>
        </div>
      ) : currentTrade.takenBy ? (
        <div className="trade-result">
          <div>Trade taken by {currentTrade.takenBy}</div>
          <div>Bet Amount: ${Math.floor(currentTrade.betAmount)}</div>
          <div>Bet Fee: ${Math.floor(currentTrade.betFee)}</div>
          {currentTrade.result && (
            <div className={`result ${currentTrade.result}`}>
              {currentTrade.result === 'win' ? 
                `Won $${Math.floor(currentTrade.winAmount)} (After fee: $${Math.floor(currentTrade.finalAmount)})` : 
                `Lost $${Math.floor(currentTrade.betAmount + currentTrade.betFee)}`}
            </div>
          )}
        </div>
      ) : (
        <div className="trade-expired">Trade Expired</div>
      )}
    </div>
  );

  const renderTradeHistory = () => (
    <div className="trade-history">
      <h4>Trade History</h4>
      <div className="history-list">
        {tradeHistory.map((trade) => (
          <div key={trade.timestamp} className="history-item">
            <div className="history-header">
              <div className="trade-odds">
                <span className="label">Odds:</span>
                <span className="value">{trade.odds}</span>
              </div>
              <div className="trade-prob">
                <span className="label">Win Probability:</span>
                <span className="value">{Math.floor(trade.probability)}%</span>
              </div>
            </div>
            {trade.takenBy ? (
              <div className="history-details">
                <div className="trade-row">
                  <div className="trade-player">
                    <span className="label">Player:</span>
                    <span className="value">{trade.takenBy}</span>
                  </div>
                  <div className="trade-balance">
                    <span className="label">Balance:</span>
                    <span className="value">${Math.floor(trade.playerMoneyBefore).toLocaleString()}</span>
                  </div>
                </div>

                <div className="trade-row">
                  <div className="trade-bet">
                    <span className="label">Bet:</span>
                    <span className="value">${Math.floor(trade.betAmount).toLocaleString()}</span>
                  </div>
                  <div className="trade-fee">
                    <span className="label">Fee:</span>
                    <span className="value">${Math.floor(trade.betFee).toLocaleString()}</span>
                  </div>
                </div>

                <div className="trade-row">
                  <div className="trade-kelly">
                    <span className="label">Kelly Optimal:</span>
                    <span className="value">${Math.floor(trade.kellyBet).toLocaleString()} ({trade.kellyFraction}x)</span>
                  </div>
                  <div className="trade-ev">
                    <span className="label">EV:</span>
                    <span className={`value ${trade.totalEV >= 0 ? 'positive' : 'negative'}`}>
                      ${trade.totalEV.toLocaleString()} ({trade.evPerDollar >= 0 ? '+' : ''}{trade.evPerDollar}x per $1)
                    </span>
                  </div>
                </div>

                {trade.result && (
                  <div className={`trade-outcome ${trade.result}`}>
                    {trade.result === 'win' ? (
                      <>
                        <span className="label">Result:</span>
                        <span className="value positive">
                          +${Math.floor(trade.winAmount).toLocaleString()} 
                          (After fee: ${Math.floor(trade.finalAmount).toLocaleString()})
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="label">Result:</span>
                        <span className="value negative">
                          -${Math.floor(trade.betAmount + trade.betFee).toLocaleString()}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="history-expired">Trade Expired</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  useEffect(() => {
    if (game.status === 'active' && (game.currentRound || 0) > (gameSettings.rounds || 10)) {
      console.log('Round count exceeded, ending game');
      endGame();
    }
  }, [game.currentRound, game.status]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Show lobby if game hasn't started
  if (!game.status || game.status === 'waiting') {
    return (
      <div className="speed-trading-game">
        <h3>Speed Trading</h3>
        <div className="lobby-info">
          <h4>Players in Lobby ({Object.keys(game.players).length}/6)</h4>
          <div className="players-grid">
            {Object.entries(game.players).map(([name, data]) => (
              <div key={name} className="player-card">
                <span className="player-name">{name}</span>
                {data.isHost && <span className="host-badge">Host</span>}
              </div>
            ))}
          </div>
        </div>
        
        {isHost && (
          <div className="game-settings">
            <h4>Game Settings</h4>
            <div className="settings-grid">
              <div className="setting-item">
                <label>Starting Money:</label>
                <input
                  type="number"
                  value={gameSettings.startingMoney || 1000}
                  onChange={(e) => update(ref(db), {
                    [`/games/${gameId}/settings/startingMoney`]: Number(e.target.value)
                  })}
                  min="100"
                  step="100"
                />
              </div>
              <div className="setting-item">
                <label>Number of Rounds:</label>
                <input
                  type="number"
                  value={gameSettings.rounds || 10}
                  onChange={(e) => update(ref(db), {
                    [`/games/${gameId}/settings/rounds`]: Number(e.target.value)
                  })}
                  min="5"
                  max="500"
                />
              </div>
              <div className="setting-item">
                <label>Trade Timeout (seconds):</label>
                <input
                  type="number"
                  value={gameSettings.tradeTimeout || 10}
                  onChange={(e) => update(ref(db), {
                    [`/games/${gameId}/settings/tradeTimeout`]: Number(e.target.value)
                  })}
                  min="3"
                  max="20"
                />
              </div>
              <div className="setting-item">
                <label>Bet Fee (%):</label>
                <input
                  type="number"
                  value={gameSettings.betFee || 1}
                  onChange={(e) => update(ref(db), {
                    [`/games/${gameId}/settings/betFee`]: Number(e.target.value)
                  })}
                  min="0"
                  max="20"
                  step="1"
                />
              </div>
            </div>
            <button 
              onClick={startGame}
              className="start-button"
              disabled={Object.keys(game.players).length < 2}
            >
              Start Game
            </button>
          </div>
        )}
        
        {error && <div className="error-message">{error}</div>}
      </div>
    );
  }

  // Show game over screen
  if (game.status === 'completed') {
    return (
      <div className="game-over">
        <h3>Game Over!</h3>
        <div className="final-standings">
          <h4>Final Standings</h4>
          {game.finalStandings.map((player, index) => (
            <div key={player.name} className="standing-row">
              <span className="position">#{index + 1}</span>
              <span className="player-name">{player.name}</span>
              <span className="final-money">${Math.floor(player.money).toLocaleString()}</span>
              <span className="trade-count">{player.trades} trades</span>
            </div>
          ))}
        </div>
        
        {renderTradeHistory()}
        
        <button onClick={() => navigate('/')} className="return-home">
          Return to Home
        </button>
      </div>
    );
  }

  // Show active game
  return (
    <div className="speed-trading-game">
      <div className="game-header">
        <div className="round-info">
          Round {game.currentRound || 1} of {gameSettings.rounds || 10}
        </div>
        <div className="players-money">
          {Object.entries(game.players).map(([name, data]) => (
            <div key={name} className={`player-money ${name === playerName ? 'current-player' : ''}`}>
              {name}: ${data.money}
            </div>
          ))}
        </div>
      </div>

      {currentTrade && renderTradeCard()}
      {error && <div className="error-message">{error}</div>}
    </div>
  );
}

export default SpeedTradingGame; 