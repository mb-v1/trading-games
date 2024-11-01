import { useState, useEffect } from 'react';
import { ref, update } from 'firebase/database';
import { db } from '../../firebase-config';
import { rollDice } from '../../utils/gameUtils';

function LiarsDiceGame({ game, gameId, playerName }) {
  const [localDice, setLocalDice] = useState([]);
  const [currentBid, setCurrentBid] = useState(null);
  const [selectedFace, setSelectedFace] = useState(1);
  const [selectedCount, setSelectedCount] = useState(1);
  const [countdown, setCountdown] = useState(null);
  
  useEffect(() => {
    if (game.status === 'waiting') {
      initializeGame();
    }
  }, [game.status]);

  const initializeGame = async () => {
    if (isHost()) {
      const players = Object.keys(game.players);
      const updates = {
        [`games/${gameId}/status`]: 'playing',
        [`games/${gameId}/currentTurn`]: players[0],
        [`games/${gameId}/currentRound`]: 1,
        [`games/${gameId}/lastBid`]: null,
        [`games/${gameId}/lastUpdated`]: Date.now()
      };

      // Initialize dice for all players
      players.forEach(player => {
        updates[`games/${gameId}/players/${player}/dice`] = rollDice(5);
        updates[`games/${gameId}/players/${player}/isActive`] = true;
      });

      console.log('Initializing game with updates:', updates);
      await update(ref(db), updates);
    }
  };

  const isHost = () => {
    return game.players[playerName]?.isHost;
  };

  const isPlayerTurn = () => {
    return game.currentTurn === playerName;
  };

  const makeBid = async () => {
    if (!isPlayerTurn()) return;

    // Validate that the new bid is higher than the last bid
    if (game.lastBid) {
      const isValidBid = 
        selectedCount > game.lastBid.count || 
        (selectedCount === game.lastBid.count && selectedFace > game.lastBid.face);
      
      if (!isValidBid) {
        alert("Your bid must be higher than the last bid!");
        return;
      }
    }

    const nextPlayer = getNextPlayer();
    const bid = {
      player: playerName,
      count: selectedCount,
      face: selectedFace,
      timestamp: Date.now()
    };

    const updates = {
      [`games/${gameId}/lastBid`]: bid,
      [`games/${gameId}/currentTurn`]: nextPlayer,
      [`games/${gameId}/lastUpdated`]: Date.now()
    };

    console.log('Making updates:', updates);
    await update(ref(db), updates);
  };

  const challenge = async () => {
    if (!isPlayerTurn() || !game.lastBid) return;

    const allDice = Object.values(game.players)
      .filter(player => player.dice && player.dice.length > 0)
      .flatMap(player => player.dice);
    
    const actualCount = allDice.filter(d => d === game.lastBid.face).length;
    const bidWasCorrect = actualCount >= game.lastBid.count;
    const losingPlayer = bidWasCorrect ? playerName : game.lastBid.player;
    
    const updates = {
      [`games/${gameId}/lastBid`]: null,
      [`games/${gameId}/revealedDice`]: true,
      [`games/${gameId}/lastUpdated`]: Date.now(),
      [`games/${gameId}/challengeResult`]: {
        challenger: playerName,
        bidder: game.lastBid.player,
        actualCount,
        bidCount: game.lastBid.count,
        bidFace: game.lastBid.face,
        losingPlayer,
        revealEndTime: Date.now() + 10000
      }
    };

    await update(ref(db), updates);

    // Start new round after countdown unless game is over
    setTimeout(async () => {
      // Get the current dice count for the losing player
      const losingPlayerDice = [...(game.players[losingPlayer].dice || [])];
      losingPlayerDice.pop(); // Remove one die

      // Check if game is over
      const remainingPlayers = Object.entries(game.players)
        .filter(([name, player]) => 
          name !== losingPlayer && player.dice && player.dice.length > 0
        );

      if (losingPlayerDice.length === 0 && remainingPlayers.length === 1) {
        // Game over
        const gameOverUpdates = {
          [`games/${gameId}/status`]: 'completed',
          [`games/${gameId}/winner`]: remainingPlayers[0][0],
          [`games/${gameId}/gameEndMessage`]: 
            `${losingPlayer} lost all their dice! ${remainingPlayers[0][0]} wins!`,
          [`games/${gameId}/revealedDice`]: false,
          [`games/${gameId}/challengeResult`]: null,
          [`games/${gameId}/players/${losingPlayer}/dice`]: losingPlayerDice,
        };
        await update(ref(db), gameOverUpdates);
      } else {
        // Start new round
        const newRoundUpdates = {
          [`games/${gameId}/revealedDice`]: false,
          [`games/${gameId}/challengeResult`]: null,
          [`games/${gameId}/lastUpdated`]: Date.now(),
          [`games/${gameId}/players/${losingPlayer}/dice`]: losingPlayerDice,
        };

        // Roll new dice for all players
        Object.entries(game.players).forEach(([name, player]) => {
          const diceCount = name === losingPlayer ? 
            losingPlayerDice.length : 
            player.dice?.length || 0;

          if (diceCount > 0) {
            newRoundUpdates[`games/${gameId}/players/${name}/dice`] = 
              Array.from({ length: diceCount }, 
                () => Math.floor(Math.random() * 6) + 1
              );
          }
        });

        // Set next turn
        const nextPlayer = getNextPlayer();
        if (nextPlayer) {
          newRoundUpdates[`games/${gameId}/currentTurn`] = nextPlayer;
        }

        await update(ref(db), newRoundUpdates);
      }
    }, 10000);
  };

  const getNextPlayer = () => {
    // Get all players that still have dice, in order of their position
    const activePlayers = Object.entries(game.players)
      .filter(([_, player]) => player.dice?.length > 0)
      .map(([name]) => name);

    if (activePlayers.length === 0) return null;

    const currentIndex = activePlayers.indexOf(game.currentTurn);
    // If current player isn't found or is last, start from beginning
    if (currentIndex === -1 || currentIndex === activePlayers.length - 1) {
      return activePlayers[0];
    }
    return activePlayers[currentIndex + 1];
  };

  // Add this useEffect to monitor game state changes
  useEffect(() => {
    console.log('Game state updated:', {
      currentTurn: game.currentTurn,
      players: game.players,
      lastBid: game.lastBid
    });
  }, [game]);

  // Add this useEffect to monitor dice changes
  useEffect(() => {
    console.log('Dice state updated:', {
      players: Object.entries(game.players).map(([name, player]) => ({
        name,
        diceCount: player.dice?.length
      }))
    });
  }, [game.players]);

  // Add useEffect to handle countdown for all players
  useEffect(() => {
    if (game.challengeResult?.revealEndTime) {
      const updateCountdown = () => {
        const now = Date.now();
        const timeLeft = Math.ceil((game.challengeResult.revealEndTime - now) / 1000);
        
        if (timeLeft <= 0) {
          setCountdown(null);
          return false; // Return false to stop the interval
        }
        
        setCountdown(timeLeft);
        return true; // Continue the interval
      };

      // Initial countdown update
      updateCountdown();

      // Update countdown every second
      const intervalId = setInterval(() => {
        const shouldContinue = updateCountdown();
        if (!shouldContinue) {
          clearInterval(intervalId);
        }
      }, 1000);

      return () => clearInterval(intervalId);
    } else {
      setCountdown(null);
    }
  }, [game.challengeResult?.revealEndTime]);

  // Add a helper function to show player order
  const getPlayerOrder = () => {
    return Object.entries(game.players)
      .filter(([_, player]) => player.dice?.length > 0)
      .map(([name], index) => (
        <span key={name} className="player-order">
          {index + 1}. {name}
          {name === game.currentTurn ? ' (Current Turn)' : ''}
        </span>
      ));
  };

  // Calculate total dice in play
  const totalDiceCount = () => {
    return Object.values(game.players)
      .reduce((sum, player) => sum + (player.dice?.length || 0), 0);
  };

  // Check if current bid is valid
  const canMakeBid = () => {
    if (!isPlayerTurn()) return false;
    
    if (!game.lastBid) return true;
    
    return selectedCount > game.lastBid.count || 
      (selectedCount === game.lastBid.count && selectedFace > game.lastBid.face);
  };

  return (
    <div className="liars-dice-game">
      <div className="game-status">
        {game.status === 'completed' ? (
          <div className="winner-message">
            🎉 {game.gameEndMessage || `${game.winner} wins the game!`} 🎉
          </div>
        ) : countdown ? (
          <div className="countdown-message">
            New round starting in {countdown} seconds...
          </div>
        ) : (
          game.currentTurn === playerName ? (
            <div className="status-message">It's your turn!</div>
          ) : (
            <div className="status-message">Waiting for {game.currentTurn}'s move...</div>
          )
        )}
      </div>

      <div className="player-order-section">
        <h3>Turn Order:</h3>
        <div className="player-order-list">
          {getPlayerOrder()}
        </div>
      </div>

      <div className="players-section">
        {Object.entries(game.players).map(([name, player]) => (
          <div 
            key={name} 
            className={`player-card ${name === playerName ? 'current-player' : ''} 
              ${name === game.currentTurn ? 'active-turn' : ''}
              ${player.dice?.length === 0 ? 'eliminated' : ''}`}
          >
            <div className="player-info">
              <span className="player-name">
                {name} {player.dice?.length === 0 && '(Eliminated)'}
              </span>
              <span className="dice-count">
                Dice: {player.dice?.length || 0}
              </span>
              {name === game.currentTurn && game.status !== 'completed' && (
                <span className="turn-indicator">🎲 Current Turn</span>
              )}
            </div>
            {((name === playerName && !game.revealedDice) || game.revealedDice) && (
              <div className="dice-display">
                {player.dice?.map((value, i) => (
                  <span key={i} className="die">
                    {['⚀','⚁','⚂','⚃','⚄','⚅'][value-1]}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {game.currentTurn === playerName && !game.revealedDice && game.status !== 'completed' && (
        <div className="game-controls">
          <div className="bid-controls">
            <select 
              value={selectedCount} 
              onChange={(e) => setSelectedCount(Number(e.target.value))}
            >
              {Array.from({ length: totalDiceCount() }, (_, i) => (
                <option key={i+1} value={i+1}>{i+1}</option>
              ))}
            </select>
            <select 
              value={selectedFace} 
              onChange={(e) => setSelectedFace(Number(e.target.value))}
            >
              {Array.from({ length: 6 }, (_, i) => (
                <option key={i+1} value={i+1}>{i+1}</option>
              ))}
            </select>
            <button 
              onClick={makeBid}
              disabled={!canMakeBid()}
              className="bid-button"
            >
              Make Bid
            </button>
            {game.lastBid && (
              <button 
                onClick={challenge}
                className="challenge-button"
              >
                Challenge Last Bid
              </button>
            )}
          </div>
        </div>
      )}

      {game.lastBid && (
        <div className="current-bid">
          Last Bid: {game.lastBid.count} {game.lastBid.face}'s by {game.lastBid.player}
        </div>
      )}

      {game.revealedDice && (
        <div className="revealed-dice">
          <h3>Revealed Dice:</h3>
          {Object.entries(game.players).map(([name, player]) => (
            <div key={name} className="player-revealed-dice">
              <span className="player-name">{name}:</span>
              <div className="dice-display">
                {player.dice?.map((value, i) => (
                  <span key={i} className="die">
                    {['⚀','⚁','⚂','⚃','⚄','⚅'][value-1]}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default LiarsDiceGame; 