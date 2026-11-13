// First: no zod schema may be built before zod is told the CSP forbids eval (lib/zodConfig.ts).
import './lib/zodConfig';
import './styles/fonts.css';
import './styles/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { capturePass } from './features/kiki/pass';
import { watchStaleChunks } from './lib/staleChunks';

// A demo-pass link (#kiki-pass=…) is not a scene: keep the pass, clear the address before the scenes read it.
capturePass();
// A deploy while this tab was open: reload once instead of a stuck scene.
watchStaleChunks();

const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing in index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
