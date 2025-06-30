const fs = require('fs').promises;
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    this.logFile = path.join(this.logDir, 'server.log');
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    this.clearSize = 100 * 1024; // 100KB to clear from beginning
    this.ensureLogDir();
  }

  async ensureLogDir() {
    try {
      await fs.access(this.logDir);
    } catch {
      await fs.mkdir(this.logDir, { recursive: true });
    }
  }

  async log(level, message) {
    const timestamp = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`;

    try {
      await this.cleanupLogIfNeeded();

      await fs.appendFile(this.logFile, logEntry);
    } catch (error) {
      console.error('Logging error:', error.message);
    }
  }

  async cleanupLogIfNeeded() {
    try {
      const stats = await fs.stat(this.logFile);
      if (stats.size >= this.maxLogSize) {
        await this.cleanupLog();
      }
    } catch (error) {
      // File doesn't exist yet, no cleanup needed
    }
  }

  async cleanupLog() {
    try {
      // Read the current log file
      const logContent = await fs.readFile(this.logFile, 'utf8');

      const newContent = logContent.slice(this.clearSize);

      // Write back the trimmed content
      await fs.writeFile(this.logFile, newContent);

      // Log the cleanup action
      const timestamp = new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const cleanupEntry = `[${timestamp}] INFO: Log file cleaned up - removed first ${this.clearSize / 1024}KB\n`;
      await fs.appendFile(this.logFile, cleanupEntry);
    } catch (error) {
      console.error('Log cleanup error:', error.message);
    }
  }

  info(message) { this.log('info', message); }
  warn(message) { this.log('warn', message); }
  error(message) { this.log('error', message); }
}

const logger = new Logger();
module.exports = logger;
