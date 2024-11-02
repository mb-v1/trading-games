import { useNavigate } from 'react-router-dom';
import './Header.css';

function Header() {
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <div className="header-content">
        <h1 onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="header-icon">📈</span>
          Trading Games
          <span className="header-subtitle">Master the Market</span>
        </h1>
        <nav className="nav-menu">
          <a onClick={() => navigate('/')} className="nav-link">Dashboard</a>
          <a onClick={() => navigate('/leaderboard')} className="nav-link">Rankings</a>
          <a onClick={() => navigate('/learn')} className="nav-link">Learn</a>
        </nav>
      </div>
    </header>
  );
}

export default Header; 