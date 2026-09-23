const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const dbFile = path.resolve(__dirname, '..', 'ai_evoting.sqlite')

const db = new sqlite3.Database(dbFile)

const candidates = [
  { name: 'Candidate A', party: 'Party Alpha' },
  { name: 'Candidate B', party: 'Party Beta' },
  { name: 'Candidate C', party: 'Party Gamma' }
]

db.serialize(() => {
  const stmt = db.prepare('INSERT INTO candidates (name, party) VALUES (?, ?)')
  candidates.forEach(c => stmt.run(c.name, c.party))
  stmt.finalize(() => {
    console.log('Seeded candidates')
    db.close()
  })
})
