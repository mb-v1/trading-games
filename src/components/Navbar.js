import { useNavigate } from 'react-router-dom';

function Navbar() {
  const navigate = useNavigate();

  return (
    <nav>
      <h1 onClick={() => navigate('./')} style={{ cursor: 'pointer' }}>
        Trading Games
      </h1>
      {/* ... rest of navbar content ... */}
    </nav>
  );
} 