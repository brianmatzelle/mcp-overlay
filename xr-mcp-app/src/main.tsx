import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// StrictMode removed: it double-fires effects in dev, which creates
// duplicate WebSocket connections to the voice server.
createRoot(document.getElementById('root')!).render(<App />)
