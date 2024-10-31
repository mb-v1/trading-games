import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import GameRoom from './pages/GameRoom';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <h1>Gaming Platform</h1>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game/:gameId" element={<GameRoom />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
