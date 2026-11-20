import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { SessionProvider } from './auth/session'
import { App } from './App'
import './official/styles.css'
import 'highlight.js/styles/github.css'
import './appearance/fonts/fonts.css'
import './site.css'

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <BrowserRouter><SessionProvider><App /></SessionProvider></BrowserRouter>
  </QueryClientProvider>,
)
