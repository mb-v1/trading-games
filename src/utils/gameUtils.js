export const determineWinner = (player1, player2) => {
  if (player1.choice === player2.choice) return 'tie';
  
  const rules = {
    rock: 'scissors',
    paper: 'rock',
    scissors: 'paper'
  };
  
  return rules[player1.choice] === player2.choice ? player1.name : player2.name;
};

export const getResultMessage = (result, playerName) => {
  if (!result) return '';
  if (result.winner === 'tie') return "It's a tie!";
  return result.winner === playerName ? 'You won! 🎉' : 'You lost...';
};

export const rollDice = (count) => {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
}; 