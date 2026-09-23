import React, { useEffect, useState } from 'react'

export default function App() {
  const [status, setStatus] = useState('unknown')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setStatus(d.status))
      .catch(() => setStatus('offline'))
  }, [])

  return (
    <div style={{ padding: 20 }}>
      <h1>AI E-Voting (frontend)</h1>
      <p>Backend status: {status}</p>
      <p>Next: implement authentication and voting UI.</p>
    </div>
  )
}
