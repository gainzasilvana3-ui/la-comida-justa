import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { AccessProvider } from './license/AccessProvider';
import { ConfirmProvider, ToastProvider } from './ui/kit';
import { installErrorReporting } from './lib/errors';

installErrorReporting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <AccessProvider>
          <App />
        </AccessProvider>
      </ConfirmProvider>
    </ToastProvider>
  </StrictMode>,
);
