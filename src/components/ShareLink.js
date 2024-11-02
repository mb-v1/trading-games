import { useState } from 'react';

function ShareLink({ gameUrl }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(gameUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="share-link">
      <input
        type="text"
        value={gameUrl}
        readOnly
        className="share-input"
      />
      <button 
        onClick={copyToClipboard}
        className={`copy-button ${copied ? 'copied' : ''}`}
      >
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
    </div>
  );
}

export default ShareLink; 