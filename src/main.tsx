import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { startPersistence } from './state/store';
import './styles.css';
import { App } from './ui/App';

startPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
