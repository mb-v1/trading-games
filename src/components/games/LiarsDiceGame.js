import { useState, useEffect } from 'react';
import { ref, update } from 'firebase/database';
import { db } from '../../firebase-config';
import { rollDice } from '../../utils/gameUtils';
import LoadingSpinner from '../LoadingSpinner';
import { useNavigate } from 'react-router-dom';

function LiarsDiceGame({ game, gameId, playerName }) {
  const [selectedCount, setSelectedCount] = useState(1);
  const [selectedFace, setSelectedFace] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const isHost = () => game.players[playerName]?.isHost;
  const isPlayerTurn = () => game.currentTurn === playerName;

  // When a player joins, they should be marked as waiting if the game hasn't started
  useEffect(() => {
    if (game.status === 'waiting' && game.players[playerName] && !game.players[playerName].isActive) {
      update(ref(db), {
        [`games/${gameId}/players/${playerName}/isActive`]: true
      });
    }
  }, [game.status, game.players, playerName, gameId]);

  const startGame = async () => {
    if (!isHost()) return;
    
    setIsLoading(true);
    try {
      const activePlayers = Object.entries(game.players)
        .filter(([_, player]) => player.isActive)
        .map(([name]) => name);

      if (activePlayers.length < 2) {
        setError('Need at least 2 players to start');
        setIsLoading(false);
        return;
      }

      const updates = {
        [`games/${gameId}/status`]: 'playing',
        [`games/${gameId}/currentTurn`]: activePlayers[0],
        [`games/${gameId}/lastUpdated`]: Date.now()
      };

      // Initialize dice for all active players
      activePlayers.forEach(player => {
        updates[`games/${gameId}/players/${player}/dice`] = rollDice(5);
      });

      await update(ref(db), updates);
    } catch (error) {
      setError('Failed to start game');
      console.error('Error starting game:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const makeBid = async () => {
    if (!isPlayerTurn() || isLoading) return;

    setIsLoading(true);
    try {
      // Validate bid
      if (game.lastBid) {
        const isValidBid = 
          selectedCount > game.lastBid.count || 
          (selectedCount === game.lastBid.count && selectedFace > game.lastBid.face);
        
        if (!isValidBid) {
          setError("Your bid must be higher than the last bid!");
          setIsLoading(false);
          return;
        }
      }

      // Get next player
      const activePlayers = Object.entries(game.players)
        .filter(([_, player]) => player.isActive)
        .map(([name]) => name);
      const currentIndex = activePlayers.indexOf(playerName);
      const nextPlayer = activePlayers[(currentIndex + 1) % activePlayers.length];

      const bid = {
        player: playerName,
        count: selectedCount,
        face: selectedFace,
        timestamp: Date.now()
      };

      await update(ref(db), {
        [`games/${gameId}/lastBid`]: bid,
        [`games/${gameId}/currentTurn`]: nextPlayer,
        [`games/${gameId}/lastUpdated`]: Date.now()
      });

    } catch (error) {
      console.error('Error making bid:', error);
      setError('Failed to make bid');
    } finally {
      setIsLoading(false);
    }
  };

  const challenge = async () => {
    if (!isPlayerTurn() || isLoading || !game.lastBid) return;

    setIsLoading(true);
    try {
      // Count total dice matching the bid face
      const allDice = Object.entries(game.players)
        .filter(([_, player]) => player.isActive)
        .flatMap(([_, player]) => player.dice || []);
      
      const actualCount = allDice.filter(die => die === game.lastBid.face).length;
      const bidWasCorrect = actualCount >= game.lastBid.count;
      
      // Determine who loses a die
      const losingPlayer = bidWasCorrect ? playerName : game.lastBid.player;
      const loserCurrentDice = game.players[losingPlayer].dice || [];
      const loserNewDice = loserCurrentDice.slice(1); // Remove one die

      // First reveal all dice and show challenge result
      await update(ref(db), {
        [`games/${gameId}/revealedDice`]: true,
        [`games/${gameId}/challengeResult`]: {
          challenger: playerName,
          bidder: game.lastBid.player,
          actualCount,
          bidCount: game.lastBid.count,
          bidFace: game.lastBid.face,
          losingPlayer,
          allPlayerDice: Object.fromEntries(
            Object.entries(game.players)
              .filter(([_, player]) => player.isActive)
              .map(([name, player]) => [name, player.dice])
          )
        },
        [`games/${gameId}/lastUpdated`]: Date.now()
      });

      setIsLoading(false); // Allow challenger to see the reveal

      // Wait 10 seconds before processing the result
      await new Promise(resolve => setTimeout(resolve, 10000));

      setIsLoading(true);

      const updates = {
        [`games/${gameId}/lastBid`]: null,
        [`games/${gameId}/revealedDice`]: false,
        [`games/${gameId}/challengeResult`]: null,
        [`games/${gameId}/lastUpdated`]: Date.now()
      };

      // Update the losing player's dice count
      updates[`games/${gameId}/players/${losingPlayer}/dice`] = loserNewDice;

      if (loserNewDice.length === 0) {
        // Mark player as eliminated
        updates[`games/${gameId}/players/${losingPlayer}/isActive`] = false;
        
        // Get remaining active players AFTER elimination
        const remainingPlayers = Object.entries(game.players)
          .filter(([name, player]) => 
            player.isActive && name !== losingPlayer
          );

        console.log('Remaining players:', remainingPlayers); // Debug log

        if (remainingPlayers.length === 1) {
          // Game is over - set winner and status
          updates[`games/${gameId}/status`] = 'completed';
          updates[`games/${gameId}/winner`] = remainingPlayers[0][0];
          updates[`games/${gameId}/currentTurn`] = null;
          console.log('Game over, winner:', remainingPlayers[0][0]); // Debug log
        } else if (remainingPlayers.length > 1) {
          // Continue game with remaining players
          const nextPlayer = remainingPlayers[0][0];
          updates[`games/${gameId}/currentTurn`] = nextPlayer;
          
          // Reroll dice for remaining players
          remainingPlayers.forEach(([name, player]) => {
            updates[`games/${gameId}/players/${name}/dice`] = rollDice(player.dice.length);
          });
        }
      } else {
        // No elimination, just continue with next round
        const remainingPlayers = Object.entries(game.players)
          .filter(([_, player]) => player.isActive)
          .map(([name]) => name);

        const nextPlayer = remainingPlayers[0];
        updates[`games/${gameId}/currentTurn`] = nextPlayer;
        
        // Reroll dice for all active players
        Object.entries(game.players)
          .filter(([_, player]) => player.isActive)
          .forEach(([name, player]) => {
            const diceCount = name === losingPlayer ? loserNewDice.length : player.dice.length;
            updates[`games/${gameId}/players/${name}/dice`] = rollDice(diceCount);
          });
      }

      console.log('Final updates:', updates); // Debug log
      await update(ref(db), updates);
      setIsLoading(false);

    } catch (error) {
      console.error('Error processing challenge:', error);
      setError('Failed to process challenge');
      setIsLoading(false);
    }
  };

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      const copyButton = document.querySelector('.copy-button');
      copyButton.textContent = 'Copied!';
      setTimeout(() => {
        copyButton.textContent = 'Copy Link';
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Show lobby if game hasn't started
  if (game.status === 'waiting') {
    return (
      <div className="game-lobby">
        <h2>Liar's Dice Lobby</h2>
        <div className="players-list">
          {Object.entries(game.players).map(([name, data]) => (
            <div key={name} className="lobby-player">
              <span className="player-name">{name}</span>
              {data.isHost && <span className="host-badge">Host</span>}
            </div>
          ))}
        </div>
        {isHost() && (
          <div className="lobby-controls">
            <button 
              onClick={startGame}
              disabled={Object.keys(game.players).length < 2}
              className="start-game-button"
            >
              Start Game
            </button>
            {Object.keys(game.players).length < 2 && (
              <p className="waiting-message">Waiting for more players to join...</p>
            )}
          </div>
        )}
        <div className="share-section">
          <h3>Invite Players</h3>
          <p>Share this link with friends:</p>
          <div className="share-link">
            <input
              type="text"
              readOnly
              value={window.location.href}
              className="share-input"
            />
            <button
              onClick={copyInviteLink}
              className="copy-button"
            >
              Copy Link
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show game interface
  return (
    <div className="liars-dice-game">
      {game.status === 'completed' ? (
        <div className="game-over-overlay">
          <div className="game-over-card">
            <h2>Game Over!</h2>
            <div className="winner-announcement">
              <p>Winner:</p>
              <h3>{game.winner}</h3>
            </div>
            <button onClick={() => navigate('/')} className="return-home-button">
              Return to Home
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="game-status">
            <h3>Current Turn: {game.currentTurn}</h3>
          </div>

          <div className="players-section">
            {Object.entries(game.players).map(([name, data]) => (
              <div key={name} 
                className={`player-card ${name === playerName ? 'current-player' : ''} 
                  ${!data.isActive ? 'eliminated' : ''} 
                  ${name === game.currentTurn ? 'active-turn' : ''}`}
              >
                <div className="player-info">
                  <span className="player-name">{name}</span>
                  <span className="dice-count">{data.dice?.length || 0} dice</span>
                  {name === game.currentTurn && (
                    <span className="current-turn-badge">Current Turn</span>
                  )}
                </div>
                <div className="dice-section">
                  {(name === playerName || game.revealedDice) && data.dice ? (
                    data.dice.map((die, index) => (
                      <div key={index} className="die">
                        {die}
                      </div>
                    ))
                  ) : (
                    Array(data.dice?.length || 0).fill(null).map((_, index) => (
                      <div key={index} className="die hidden">
                        ?
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {isPlayerTurn() && game.players[playerName].isActive && (
            <div className="game-controls">
              <div className="bid-controls">
                <div className="bid-input">
                  <label>Count:</label>
                  <input
                    type="number"
                    min="1"
                    value={selectedCount}
                    onChange={(e) => setSelectedCount(parseInt(e.target.value))}
                  />
                </div>
                <div className="bid-input">
                  <label>Face:</label>
                  <select 
                    value={selectedFace}
                    onChange={(e) => setSelectedFace(parseInt(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6].map(num => (
                      <option key={num} value={num}>{num}</option>
                    ))}
                  </select>
                </div>
                <button onClick={() => makeBid()} className="bid-button">
                  Make Bid
                </button>
                {game.lastBid && (
                  <button onClick={() => challenge()} className="challenge-button">
                    Challenge!
                  </button>
                )}
              </div>
            </div>
          )}

          {game.lastBid && (
            <div className="last-bid-container">
              <div className="last-bid-card">
                <div className="bid-header">Last Bid</div>
                <div className="bid-content">
                  <div className="bid-player">{game.lastBid.player}</div>
                  <div className="bid-details">
                    <div className="bid-dice">
                      {Array(game.lastBid.count).fill(null).map((_, index) => (
                        <div key={index} className="die bid-die">
                          {game.lastBid.face}
                        </div>
                      ))}
                    </div>
                    <div className="bid-text">
                      {game.lastBid.count} {game.lastBid.face}'s
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {game.revealedDice && game.challengeResult && (
            <div className="challenge-result-overlay">
              <div className="challenge-result-card">
                <h3>Challenge Result!</h3>
                <div className="result-details">
                  <p><strong>{game.challengeResult.challenger}</strong> challenged</p>
                  <p><strong>{game.challengeResult.bidder}</strong>'s bid of {game.challengeResult.bidCount} {game.challengeResult.bidFace}'s</p>
                  
                  <div className="all-player-dice">
                    {Object.entries(game.challengeResult.allPlayerDice).map(([name, dice]) => (
                      <div key={name} className="player-dice-reveal">
                        <div className="player-name">{name}</div>
                        <div className="dice-row">
                          {dice.map((die, index) => (
                            <div 
                              key={index} 
                              className={`die ${die === game.challengeResult.bidFace ? 'matching-die' : ''}`}
                            >
                              {die}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="challenge-summary">
                    <p>Total {game.challengeResult.bidFace}'s found: {game.challengeResult.actualCount}</p>
                    <p className="losing-player">
                      {game.challengeResult.losingPlayer} lost a die!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && <div className="error-message">{error}</div>}
        </>
      )}
    </div>
  );
}

export default LiarsDiceGame;