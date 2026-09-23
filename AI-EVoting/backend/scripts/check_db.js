const pool = require('../db')

;(async () => {
  try {
    const res = await pool.query("SELECT name FROM sqlite_master WHERE type='table'")
    console.log(res.rows)
  } catch (e) {
    console.error('DB check failed', e)
  }
  process.exit(0)
})()
