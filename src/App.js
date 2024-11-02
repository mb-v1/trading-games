import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Home from './pages/Home';
import GameRoom from './pages/GameRoom';
import Header from './components/Header';
import './styles/index.css';

function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => setIsLoading(false), 1000);
  }, []);

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loader"></div>
        <p>Loading Trading Games...</p>
      </div>
    );
  }

  return (
    <Router basename="/">
      <div className="App">
        <Header />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="game/:gameId" element={<GameRoom />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <footer className="app-footer">
          <div className="footer-content">
            <p>© 2024 Trading Games • Practice Trading Risk-Free</p>
            <div className="footer-links">
              <a href="#/about">About</a>
              <a href="#/terms">Terms</a>
              <a href="#/privacy">Privacy</a>
            </div>
          </div>
        </footer>
      </div>
    </Router>
  );
}

const NotFound = () => (
  <div className="not-found">
    <h2>404 - Page Not Found</h2>
    <p>Looks like this trading floor doesn't exist.</p>
    <a href="#/" className="button primary-button">Return to Dashboard</a>
  </div>
);

export default App;
