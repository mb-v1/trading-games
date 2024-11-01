import { useState, useEffect } from 'react';
import { ref, update } from 'firebase/database';
import { db } from '../../firebase-config';
import { rollDice } from '../../utils/gameUtils';

function LiarsDiceGame({ game, gameId, playerName }) {
  const [localDice, setLocalDice] = useState([]);
  const [currentBid, setCurrentBid] = useState(null);
  const [selectedFace, setSelectedFace] = useState(1);
  const [selectedCount, setSelectedCount] = useState(1);
  
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

    // Collect all dice and count the bid face
    const allDice = Object.values(game.players)
      .filter(player => player.dice && player.dice.length > 0)
      .flatMap(player => player.dice);
    
    const actualCount = allDice.filter(d => d === game.lastBid.face).length;
    const bidWasCorrect = actualCount >= game.lastBid.count;
    const losingPlayer = bidWasCorrect ? playerName : game.lastBid.player;
    
    // Get current dice array of losing player and remove one die
    const currentDice = [...(game.players[losingPlayer].dice || [])];
    currentDice.pop(); // Remove one die

    const updates = {
      [`games/${gameId}/players/${losingPlayer}/dice`]: currentDice,
      [`games/${gameId}/lastBid`]: null,
      [`games/${gameId}/revealedDice`]: true,
      [`games/${gameId}/lastUpdated`]: Date.now(),
      [`games/${gameId}/challengeResult`]: {
        challenger: playerName,
        bidder: game.lastBid.player,
        actualCount,
        bidCount: game.lastBid.count,
        bidFace: game.lastBid.face,
        losingPlayer
      }
    };

    // Start new round if game should continue
    if (currentDice.length > 0) {
      // Roll new dice for all active players
      Object.entries(game.players).forEach(([player, playerData]) => {
        if (player === losingPlayer) {
          // Losing player gets one less die
          updates[`games/${gameId}/players/${player}/dice`] = rollDice(currentDice.length);
        } else if (playerData.dice?.length > 0) {
          // Other players keep their current number of dice
          updates[`games/${gameId}/players/${player}/dice`] = rollDice(playerData.dice.length);
        }
      });
      
      // Set the losing player as the next turn
      updates[`games/${gameId}/currentTurn`] = losingPlayer;
    } else {
      // Check if game is over (only one player with dice remaining)
      const remainingPlayers = Object.entries(game.players)
        .filter(([_, player]) => player.dice?.length > 0);
      
      if (remainingPlayers.length === 1) {
        updates[`games/${gameId}/status`] = 'completed';
        updates[`games/${gameId}/winner`] = remainingPlayers[0][0];
      }
    }

    console.log('Challenge updates:', updates);
    await update(ref(db), updates);
  };

  const getNextPlayer = () => {
    const activePlayers = Object.entries(game.players)
      .filter(([_, player]) => player.dice?.length > 0)
      .map(([name]) => name);
    
    const currentIndex = activePlayers.indexOf(game.currentTurn);
    const nextIndex = (currentIndex + 1) % activePlayers.length;
    return activePlayers[nextIndex];
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

  return (
    <div className="liars-dice-game">
      <div className="game-status">
        {game.status === 'completed' ? (
          <div className="winner-message">
            🎉 {game.winner} wins the game! 🎉
          </div>
        ) : (
          game.currentTurn === playerName ? (
            <div className="status-message">It's your turn!</div>
          ) : (
            <div className="status-message">Waiting for {game.currentTurn}'s move...</div>
          )
        )}
      </div>

      {game.challengeResult && (
        <div className="challenge-result">
          <h3>Challenge Result:</h3>
          <p>
            {game.challengeResult.challenger} challenged {game.challengeResult.bidder}'s bid of{' '}
            {game.challengeResult.bidCount} {game.challengeResult.bidFace}'s
          </p>
          <p>
            Actual count: {game.challengeResult.actualCount}
          </p>
          <p>
            {game.challengeResult.losingPlayer} lost a die!
          </p>
        </div>
      )}

      <div className="players-section">
        {Object.entries(game.players).map(([name, player]) => (
          <div 
            key={name} 
            className={`player-card ${name === playerName ? 'current-player' : ''} ${name === game.currentTurn ? 'active-turn' : ''}`}
          >
            <div className="player-info">
              <span className="player-name">{name}</span>
              <span className="dice-count">
                Dice: {player.dice?.length || 0}
              </span>
              {name === game.currentTurn && <span className="turn-indicator">🎲 Current Turn</span>}
            </div>
            {(name === playerName || game.revealedDice) && (
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

      {isPlayerTurn() && game.players[playerName]?.dice?.length > 0 && (
        <div className="game-controls">
          <div className="bid-controls">
            <div className="bid-inputs">
              <select 
                value={selectedCount} 
                onChange={(e) => setSelectedCount(Number(e.target.value))}
              >
                {Array.from({ length: 30 }, (_, i) => (
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
            </div>
            <div className="action-buttons">
              <button 
                onClick={makeBid}
                disabled={game.lastBid && selectedCount === 0}
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