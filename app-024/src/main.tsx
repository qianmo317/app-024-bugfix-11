import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { store } from './lib/store';
import './styles.css';

store.init();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
