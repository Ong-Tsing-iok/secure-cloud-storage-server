import { Pool } from 'pg'
import ConfigManager from './ConfigManager.js'
import { logger } from './Logger.js'
import { randomUUID } from 'crypto'

//--  Setup --//
const secretShareDbPools = []
for (const secretShareDbConfig of ConfigManager.secretShareDbConfigs) {
  const pool = new Pool(secretShareDbConfig)
  pool.on('error', (err) => {
    logger.error(err)
  })
  secretShareDbPools.push(pool)
}

export async function retrieveUserShares(userId) {
  const shares = []
  for (const pool of secretShareDbPools) {
    try {
      const result = await pool.query(
        `SELECT share FROM secret_share WHERE userid = $1 AND retrievable = TRUE;`,
        [userId]
      )
      if (result.rowCount > 0) {
        shares.push(result.rows[0].share)
      }
    } catch (error) {
      // Database could not correctly connect.
      logger.error(error)
    }
  }
  return shares
}

export async function storeUserShares(userId, shares) {
  let i = 0
  let j = 0
  while (i < shares.length && j < secretShareDbPools.length) {
    try {
      secretShareDbPools[j].query(
        `INSERT INTO secret_share (userid, share, retrievable) VALUES ($1, $2, TRUE)`,
        [userId, shares[i]]
      )
      i++
    } catch (error) {
        logger.error(error)
    }
    j++
  }
}

//-- Tear down --//
// process.on('SIGINT', async () => {
//   logger.info('SIGINT signal received: Closing PostgreSQL pool...')
//   await pool.end()
//   logger.info('PostgreSQL pool closed. Exiting process.')
//   process.exit(0)
// })

// process.on('SIGTERM', async () => {
//   logger.info('SIGTERM signal received: Closing PostgreSQL pool...')
//   await pool.end()
//   logger.info('PostgreSQL pool closed. Exiting process.')
//   process.exit(0)
// })

logger.info('Secret Share database pools initialized')
