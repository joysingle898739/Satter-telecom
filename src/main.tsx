import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist();
}

createRoot(document.getElementById('root')!).render(<App />);
