import './LoadingSpinner.css';

export function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="loading-screen">
      <div className="loader"></div>
      <p>{message}</p>
    </div>
  );
}

export default LoadingSpinner; 