# Sync Board Server

A real-time collaborative text editor server built with Node.js, Express, and Socket.IO. This server enables multiple users to collaborate on text documents in real-time with automatic synchronization, room management, and persistent storage.

## Features

### Core Functionality

-   Real-time Collaboration: Multiple users can edit text simultaneously with instant synchronization
-   Room-based System: Users join specific rooms using unique URLs for isolated collaboration sessions
-   User Management: Automatic user join/leave handling with reconnection support
-   Room Capacity Control: Configurable maximum users per room (default: 10 users)
-   Graceful Disconnection: 5-second grace period for reconnections before removing users
-   Persistent Storage: Automatic file-based backup of room data and user sessions
-   Text Size Limits: Configurable maximum text length (default: 1MB)
-   Input Validation: Comprehensive sanitization of room IDs, user IDs, and text content

### Technical Features

-   Modular Architecture: Clean separation of concerns with organized file structure
-   File-based Logging: Comprehensive logging with automatic log rotation (10MB limit)
-   Error Handling: Robust error handling with graceful degradation
-   Cross-origin Support: CORS enabled for client-server communication
-   Environment-aware: Automatic client URL detection for development/production
-   Memory Management: Efficient data storage with automatic cleanup

## Architecture

### Modular Structure

```
src/
├── config/
│   └── constants.js         # Configuration and environment settings
├── handlers/
│   └── socketHandlers.js    # Socket event handlers and business logic
├── socket/
│   └── SocketManager.js     # Socket.IO connection management
├── storage/
│   └── DataStorage.js       # Data persistence and room management
└── utils/
    ├── logger.js            # File-based logging with rotation
    └── validation.js        # Input sanitization and validation
```

### Data Flow

1. Client Connection: Socket connects and receives unique session ID
2. Room Initialization: User joins room with validated room ID and user ID
3. Real-time Sync: Text changes broadcast to all room participants
4. Persistent Storage: Room data automatically saved to disk
5. Graceful Cleanup: Disconnected users removed after grace period

## Quick Start

### Prerequisites

-   Node.js 14+
-   npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/ajittupe2548/sync-board-server.git
cd sync-board-server

# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Configuration

The server automatically detects the environment and configures client URLs:

-   Development: `http://localhost:3000/`
-   Production: `https://sync-board-client.vercel.app/`

## API & Socket Events

### Socket Events

#### Client → Server

-   `init(syncUrl, userId)` - Join a room with room ID and user ID
-   `textChange(text, syncUrl, userId)` - Send text changes to room
-   `initText(url, userId)` - Request current room text
-   `getData()` - Admin: Get all room statistics
-   `deleteData()` - Admin: Delete all room data

#### Server → Client

-   `initComplete(roomId, userId)` - Confirm successful room join
-   `textChange(text)` - Receive text changes from other users
-   `getText(text, roomId)` - Receive current room text
-   `error(message)` - Error notifications
-   `dataResponse(data)` - Admin: Room statistics response
-   `dataDeleted(message)` - Admin: Deletion confirmation

## Configuration

### Constants (src/config/constants.js)

```javascript
{
    PORT: 5000,                    // Server port
    MAX_ROOM_SIZE: 5,              // Maximum users per room
    MAX_TEXT_LENGTH: 1000000,      // Maximum text size (1MB)
    DISCONNECT_GRACE_PERIOD: 5000, // Reconnection grace period (5s)
    INIT_THROTTLE_TIME: 1000,      // Prevent rapid init calls (1s)
    DATA_DIR: "./data",            // Data storage directory
}
```

## Logging

### Log Features

-   File-based Logging: All events logged to `logs/server.log`
-   Automatic Rotation: Log file trimmed when exceeding 10MB
-   Comprehensive Events: User joins, leaves, errors, and system events
-   Structured Format: Timestamped JSON-like format for easy parsing

### Log Events

-   Server startup and configuration
-   User joins/leaves with room capacity (e.g., "User john joined room abc123 (2/2 users)")
-   Room full rejections
-   User removals after grace period
-   Room deletions when empty
-   Error conditions and debugging information

## Data Storage

### File Structure

```
data/
├── room1.json              # Room data files
├── room2.json
└── ...

logs/
└── server.log             # Application logs
```

### Room Data Format

```json
{
    "text": "Collaborative text content",
    "users": {
        "userId1": {
            "joinedAt": "2025-06-30T12:00:00.000Z",
            "lastSeen": "2025-06-30T12:00:00.000Z"
        },
        "userId2": {
            "joinedAt": "2025-06-30T11:45:00.000Z",
            "lastSeen": "2025-06-30T12:00:00.000Z"
        }
    },
    "createdAt": "2025-06-30T11:45:00.000Z",
    "lastUpdated": "2025-06-30T12:00:00.000Z"
}
```

### In-Memory Data (Runtime Only)

The server maintains additional runtime data that is not persisted:

```json
{
    "users": {
        "userId1": {
            "socketId": "socket123", // Current socket connection
            "timeoutId": "timeout456", // Disconnect cleanup timer
            "joinedAt": "2025-06-30T12:00:00.000Z",
            "lastSeen": "2025-06-30T12:00:00.000Z"
        }
    }
}
```

## Security Features

### Input Validation

-   Room ID Sanitization: Alphanumeric characters only, length limits
-   User ID Validation: Safe character filtering and length restrictions
-   Text Content Filtering: Size limits and content sanitization
-   XSS Prevention: Input escaping and validation

### Access Control

-   Room-based Isolation: Users can only access their joined rooms
-   Session Validation: Socket session verification for all operations
-   Admin Operations: Protected admin endpoints for data management

## Error Handling

### Graceful Degradation

-   Invalid room/user IDs → Error response with user feedback
-   Room capacity exceeded → Rejection with clear messaging
-   Network disconnections → Automatic reconnection handling
-   Data corruption → Fallback to empty state with logging

### Monitoring

-   Comprehensive error logging with stack traces
-   User action tracking for debugging
-   Performance metrics for optimization
-   System health indicators

## Development

### Scripts

```bash
npm run dev        # Development with auto-restart
```

### File Watching

Development mode includes automatic server restart on file changes for faster development cycles.

## Production Deployment

### Considerations

-   Set `NODE_ENV=production` for optimized performance
-   Configure reverse proxy (nginx) for SSL termination
-   Set up log rotation and monitoring
-   Configure firewall rules for WebSocket traffic
-   Monitor memory usage and implement alerts

## Dependencies

### Core Packages

#### Express.js (^4.18.0)

Web application framework for Node.js that provides robust features for web and mobile applications.

Key Features Used:

-   HTTP Server: Creates the base HTTP server for Socket.IO attachment
-   Middleware Support: CORS middleware integration for cross-origin requests
-   Routing: Basic routing for health checks and admin endpoints
-   Static File Serving: Serves static files if needed
-   Request/Response Handling: Manages HTTP request lifecycle
-   Environment Detection: Development vs production environment configuration

In This Project:

-   Base server foundation for Socket.IO integration
-   CORS configuration for client-server communication
-   Environment-aware client URL selection
-   Middleware pipeline for request processing

#### Socket.IO (^4.7.0)

Real-time bidirectional event-based communication library enabling WebSocket connections with fallbacks.

Key Features Used:

-   Real-time Communication: Instant bidirectional data exchange between clients and server
-   Room Management: Automatic room joining/leaving for isolated collaboration sessions
-   Event-Based Architecture: Custom event handling (init, textChange, disconnect, etc.)
-   Broadcasting: Send messages to specific rooms or all connected clients
-   Connection Management: Automatic reconnection handling and connection state tracking
-   Namespace Support: Isolated communication channels (though using default namespace)
-   Transport Fallbacks: WebSocket with polling fallback for network compatibility

In This Project:

-   User session management with unique socket IDs
-   Room-based text synchronization across multiple users
-   Real-time text change broadcasting to room participants
-   Graceful connection/disconnection handling with cleanup
-   User count tracking and room capacity enforcement
-   Admin operations for data management

#### CORS (^2.8.5)

Cross-Origin Resource Sharing middleware for Express.js enabling secure cross-origin requests.

Key Features Used:

-   Cross-Origin Support: Allows client applications from different domains to connect
-   Preflight Handling: Manages OPTIONS requests for complex CORS scenarios
-   Credential Support: Enables cookies and authentication headers if needed
-   Origin Validation: Controls which domains can access the server
-   Method Whitelisting: Specifies allowed HTTP methods for security

In This Project:

-   Enables client applications (React/Next.js) to connect from different ports/domains
-   Development: Allows localhost:3000 (client) to connect to localhost:5000 (server)
-   Production: Allows Vercel-hosted client to connect to deployed server
-   WebSocket connection establishment across origins

### Development Dependencies

#### Nodemon (^3.0.0) - Development Only

Utility that monitors file changes and automatically restarts the Node.js application.

Features:

-   Auto-restart: Automatically restarts server when files change
-   File Watching: Monitors JavaScript, JSON, and other specified file types
-   Ignore Patterns: Excludes certain directories (node_modules, logs, data) from watching
-   Custom Scripts: Integration with npm scripts for development workflow

Development Workflow:

-   Watch `src/` directory for changes
-   Ignore `data/` and `logs/` directories to prevent restart loops
-   Instant feedback during development without manual server restarts

### Dependency Rationale

#### Why Express.js?

-   Lightweight: Minimal overhead for simple HTTP server needs
-   Socket.IO Integration: Native support for Socket.IO attachment
-   Middleware Ecosystem: Rich ecosystem for additional features (CORS, body parsing, etc.)
-   Production Ready: Battle-tested in production environments
-   Documentation: Extensive documentation and community support

#### Why Socket.IO?

-   Real-time Requirements: Essential for collaborative text editing
-   Browser Compatibility: Works across all modern browsers with automatic fallbacks
-   Room Management: Built-in room functionality perfect for isolated collaboration sessions
-   Reconnection Handling: Automatic reconnection with customizable strategies
-   Event System: Clean event-based architecture for different message types
-   Scalability: Can scale horizontally with Redis adapter (future enhancement)

#### Why CORS?

-   Security: Controlled cross-origin access instead of wildcard permissions
-   Development Workflow: Enables separate development servers for client/server
-   Production Deployment: Supports different domain deployments (client vs server)
-   Standards Compliance: Follows web security standards for cross-origin requests

### Security Considerations

#### Express.js Security

-   No Unnecessary Middleware: Minimal middleware stack to reduce attack surface
-   Input Validation: All user inputs validated before processing
-   Error Handling: Graceful error handling without exposing internals

#### Socket.IO Security

-   Room Isolation: Users can only access rooms they've joined
-   Input Sanitization: All socket messages validated and sanitized
-   Connection Limits: Room capacity limits prevent resource exhaustion
-   Graceful Degradation: Handles malformed messages without crashing

#### CORS Security

-   Origin Validation: Specific origin configuration instead of wildcard
-   Method Restriction: Only necessary HTTP methods allowed
-   Credential Handling: Secure credential transmission if authentication added
