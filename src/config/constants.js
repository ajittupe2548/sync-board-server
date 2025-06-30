const path = require('path');
const express = require('express');

// Configuration constants
const CONFIG = {
    PORT: process.env.PORT || 5000,
    DATA_DIR: path.join(__dirname, '../../data'),
    MAX_ROOM_SIZE: 10,
    MAX_TEXT_LENGTH: 1000000, // 1MB
    CLIENT_URL: (() => {
        const app = express();
        const isDev = app.settings.env === 'development';
        return isDev ? 'http://localhost:3000/' : 'https://sync-board-client.vercel.app/';
    })(),
    DISCONNECT_GRACE_PERIOD: 5000, // 5 seconds
    INIT_THROTTLE_TIME: 1000 // 1 second
};

module.exports = CONFIG;
