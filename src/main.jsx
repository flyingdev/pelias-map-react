import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import './index.css'
import App from './App.jsx'
import { AudioQueueProvider } from './context/AudioQueueContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MantineProvider>
      <AudioQueueProvider>
        <App />
      </AudioQueueProvider>
    </MantineProvider>
  </StrictMode>,
)
