import { errorMessages } from '../lib/api'

export function RequestErrors({ error }: { error: Error | null }) {
  if (!error) return null
  return <ul className="error-messages" role="alert">
    {errorMessages(error).map((message, index) => <li key={index}>{message}</li>)}
  </ul>
}
