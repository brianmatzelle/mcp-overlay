import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.tsx'

// StrictMode is intentionally removed — its double-invoke of useEffect breaks
// real-time media (camera stream stops/restarts) and WebSocket (connects then
// immediately disconnects). Production builds are unaffected by StrictMode.
createRoot(document.getElementById('root')!).render(<App />)
