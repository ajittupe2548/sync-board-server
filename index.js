const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const CONFIG = require('./src/config/constants');
const SocketManager = require('./src/socket/SocketManager');
const logger = require('./src/utils/logger');

class SyncBoardServer {
  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.httpServer = createServer(this.app);
    this.io = new Server(this.httpServer, {
      cors: CONFIG.CLIENT_URL,
    });
    this.socketManager = new SocketManager(this.io);
    this.setupGracefulShutdown();
  }

  setupMiddleware() {
    this.app.use(cors({ origin: CONFIG.CLIENT_URL }));
  }

  setupGracefulShutdown() {
    const gracefulShutdown = async (signal) => {
      logger.info(`Received ${signal}, gracefully shutting down...`);

      try {
        await this.socketManager.shutdown();

        // Set a timeout to force exit if graceful shutdown takes too long
        const forceExitTimeout = setTimeout(() => {
          logger.warn('Force exiting after timeout');
          process.exit(1);
        }, 5000);

        // Close server
        this.httpServer.close(() => {
          clearTimeout(forceExitTimeout);
          logger.info('Server closed gracefully');
          process.exit(0);
        });

      } catch (error) {
        logger.error(`Error during shutdown: ${error.message}`);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  }

  start() {
    this.httpServer.listen(CONFIG.PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${CONFIG.PORT}`);
      logger.info(`📁 Data directory: ${CONFIG.DATA_DIR}`);
      logger.info(`👥 Max room size: ${CONFIG.MAX_ROOM_SIZE} users`);
      logger.info(`📝 Max text length: ${(CONFIG.MAX_TEXT_LENGTH / 1000000).toFixed(1)}MB`);
      logger.info(`=== Server Ready ===`);
    });
  }
}

// Start the server
const server = new SyncBoardServer();
server.start();
