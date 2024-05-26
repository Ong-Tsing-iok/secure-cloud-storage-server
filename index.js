import { createServer } from "https";
import { Server } from "socket.io";
import express from "express";
import winston from "winston";
import { readFileSync } from "fs";
import ElGamal from "basic_simple_elgamal";
import bigInt from "big-integer";
import { getInRange } from "basic_simple_elgamal/bigIntManager.js";

const PORT = process.env.PORT || 3001;

const app = express();
const options = {
  key: readFileSync("server.key"),
  cert: readFileSync("server.crt"),
};
/**
 * @todo Redirect http to https?
 */
const server = createServer(options, app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  // defaultMeta: { service: "user-service" },
  transports: [
    //
    // - Write all logs with importance level of `error` or less to `error.log`
    // - Write all logs with importance level of `info` or less to `combined.log`
    //
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
      level: "debug",
    })
  );
}
// server.use(cors())

io.on("connection", (socket) => {
  logger.log("info", `Client connected with socket id ${socket.id}`);

  socket.on("message", (message) => {
    logger.log("info", `Received message as server: ${message}`);
    // Broadcast the message to all connected clients
    io.emit("message", message);
  });

  socket.on("disconnect", () => {
    logger.log("info", `Client with socket id ${socket.id} is disconnected`);
  });

  /**
   * @todo Generate a random authentication content, encode it with publicKey,
   * and send back to client for it to decode and send back.
   */
  socket.on("login-ask", async (p, g, y) => {
    logger.info(`Client with socket id ${socket.id} asked to login`);
    try {
      socket.elgamal = new ElGamal(p, g, y, "2"); // 2 for private key is filler value (won't use)
      logger.debug(
        `p: ${socket.elgamal.modulus}, q: ${socket.elgamal.groupOrder}`
      );
      socket.elgamal.checkSecurity(); // TODO: handle errors when p, q, y have problems
      socket.randKey = await getInRange(bigInt(p).prev(), 1);
      // socket.randKey = bigInt(56432); // TODO: Should be random generated
      const cipherPair = await socket.elgamal.encrypt(socket.randKey);
      socket.emit("login-res", cipherPair.c1, cipherPair.c2);
    } catch (error) {
      logger.error(`Error occured when ${socket.id} asked to login: ${error}`);
      socket.emit("message", "error when login-ask");
    }
  });
  /**
   * @todo Compare this decode value with the value above.
   * If is same, then this session is authenticated as this user.
   * Also check if publickey exist. If not, add to database
   * (combine register with login)
   */
  socket.on("login-auth", (decodeValue) => {
    decodeValue = bigInt(decodeValue);
    if (socket.randKey.compare(decodeValue) == 0) {
      logger.info(`Client with socket id ${socket.id} is authenticated`);
      socket.authed = true;
      socket.emit("login-auth-res", "OK");
    } else {
      logger.info(
        `Client with socket id ${socket.id} respond with incorrect authentication`
      );
      logger.debug(`respond with ${decodeValue} instead of ${socket.randKey}`);
      socket.emit("login-auth-res", "incorrect");
    }
  });
});

server.listen(PORT, () => {
  logger.log("info", `Server is running on port ${PORT}`);
});
