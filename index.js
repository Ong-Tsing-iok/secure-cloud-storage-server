import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';
import winston from 'winston';

const PORT = process.env.PORT || 3001;

const app = express()
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    //
    // - Write all logs with importance level of `error` or less to `error.log`
    // - Write all logs with importance level of `info` or less to `combined.log`
    //
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}
// server.use(cors())

io.on('connection', (socket) => {
  logger.log('info', 'A client connected');

  socket.on('message', (message) => {
    logger.log('info', 'Received message:', message);
    // Broadcast the message to all connected clients
    io.emit('message', message);
  });

  socket.on('disconnect', () => {
    logger.log('info', 'A client disconnected');
  });
});

server.listen(PORT, () => {
  logger.log('info', `Server is running on port ${PORT}`);
});
