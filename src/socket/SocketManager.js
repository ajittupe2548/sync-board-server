const DataStorage = require('../storage/DataStorage');
const SocketHandlers = require('../handlers/socketHandlers');
const CONFIG = require('../config/constants');
const logger = require('../utils/logger');

class SocketManager {
    constructor(io) {
        this.io = io;
        this.storage = new DataStorage();
        this.handlers = new SocketHandlers(this.storage);
        this.initializeSocketHandlers();
    }

    initializeSocketHandlers() {
        this.io.on('connection', (socket) => {
            // Track last init time to prevent rapid calls
            let lastInitTime = 0;

            socket.on('init', async (syncUrl, userId) => {
                // Throttle init calls - prevent multiple calls within the configured time
                const now = Date.now();
                if (now - lastInitTime < CONFIG.INIT_THROTTLE_TIME) {
                    return;
                }
                lastInitTime = now;

                await this.handlers.handleInit(socket, syncUrl, userId);
            });

            socket.on('textChange', async (text, syncUrl, userId) => {
                await this.handlers.handleTextChange(socket, text, syncUrl, userId);
            });

            socket.on('initText', (url, userId) => {
                this.handlers.handleInitText(socket, url, userId);
            });

            socket.on('getData', () => {
                this.handlers.handleGetData(socket);
            });

            socket.on('deleteData', () => {
                this.handlers.handleDeleteData(socket);
            });

            socket.on('disconnect', async () => {
                await this.handlers.handleDisconnect(socket);
            });

            socket.on('error', (error) => {
                this.handlers.handleError(error);
            });
        });
    }

    async shutdown() {
        // Save all room data before shutdown
        for (const roomId of Object.keys(this.storage.data)) {
            await this.storage.saveRoom(roomId);
        }
        logger.info('Data backup completed');

        // Close all socket connections
        this.io.close(() => {
            logger.info('Socket.IO connections closed');
        });
    }
}

module.exports = SocketManager;
