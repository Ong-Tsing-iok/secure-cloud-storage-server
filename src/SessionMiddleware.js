/**
 * Session Middleware
 *
 * This file contains the middleware for managing sessions in the server.
 * It uses the express-session and better-sqlite3-session-store libraries
 * to store session data in a SQLite database.
 *
 * The session middleware is exported as the default export of this module.
 *
 * @module SessionMiddleware
 */
import session from 'express-session'
import sqlite from 'better-sqlite3'
import sqliteStore from 'better-sqlite3-session-store'

// Create a SQLite store for session data
const SqliteStore = sqliteStore(session)

// Create a new SQLite database for session storage
const sessionDb = new sqlite('session.db', {
  verbose: process.env.NODE_ENV !== 'production' ? console.log : null
})

// Create the session middleware
const sessionMiddleware = session({
  store: new SqliteStore({
    client: sessionDb
  }),
  secret: 'keyboard cat', // TODO: should be a random string
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: true
  }
})

// Export the session middleware as the default export
export default sessionMiddleware

