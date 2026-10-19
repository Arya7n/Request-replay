import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../../src/panel/App';
import './style.css';

const root = document.getElementById('root');
if (!root) throw new Error('RequestReplay could not find its panel root.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
