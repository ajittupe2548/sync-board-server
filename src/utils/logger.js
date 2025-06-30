const fs = require('fs').promises;
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    this.logFile = path.join(this.logDir, 'server.log');
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    this.clearSize = 100 * 1024; // 100KB to clear from beginning
    this.fileLoggingEnabled = false;
    this.initializeLogging();
  }

  async initializeLogging() {
    try {
      await fs.access(this.logDir);
    } catch {
      try {
        await fs.mkdir(this.logDir, { recursive: true });
      } catch (error) {
        console.warn(`[Logger] Could not create log directory: ${error.message}. File logging disabled.`);
        this.fileLoggingEnabled = false;
        return;
      }
    }

    try {
      await fs.access(this.logFile, fs.constants.F_OK);
    } catch {
      try {
        await fs.writeFile(this.logFile, '');
      } catch (error) {
        console.warn(`[Logger] Could not create log file: ${error.message}. File logging disabled.`);
        this.fileLoggingEnabled = false;
        return;
      }
    }

    this.fileLoggingEnabled = true;
    console.log(`[Logger] File logging enabled: ${this.logFile}`);
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
    const logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

    // Always log to console
    console.log(logEntry);

    // Only log to file if file logging is enabled
    if (this.fileLoggingEnabled) {
      try {
        await this.cleanupLogIfNeeded();
        await fs.appendFile(this.logFile, logEntry + '\n');
      } catch (error) {
        console.warn(`[Logger] File logging failed: ${error.message}`);
        this.fileLoggingEnabled = false;
      }
    }
  }

  async cleanupLogIfNeeded() {
    if (!this.fileLoggingEnabled) {
      return;
    }

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
    if (!this.fileLoggingEnabled) {
      return;
    }

    try {
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
      console.warn(`[Logger] Log cleanup error: ${error.message}`);
      this.fileLoggingEnabled = false;
    }
  }

  info(message) { this.log('info', message); }
  warn(message) { this.log('warn', message); }
  error(message) { this.log('error', message); }
}

const logger = new Logger();
module.exports = logger;
