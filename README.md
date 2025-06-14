# ListenTogether Server - Refactored

A real-time music streaming server that allows multiple users to listen to music together in synchronized rooms with YouTube and Spotify integration.

## 🏗️ Architecture Overview

The project has been completely refactored following clean architecture principles:

### **Directory Structure**

```
listentogether-server/
├── config/                 # Configuration files
│   └── config.js          # Application configuration
├── controllers/           # Request handlers (business logic)
│   ├── queueController.js # Queue management
│   ├── musicController.js # Music playback
│   ├── roomController.js  # Room operations
│   └── participantController.js # Participant management
├── middleware/            # Custom middleware
│   ├── validation.js      # Request validation
│   ├── response.js        # Response formatting
│   └── socketEmitter.js   # Socket.IO event handling
├── routes/               # Express routes (thin layer)
│   ├── queueRoutes.js    # Queue endpoints
│   ├── musicRoutes.js    # Music endpoints
│   ├── roomRoutes.js     # Room endpoints
│   └── participantRoutes.js # Participant endpoints
├── services/             # Core business logic
│   ├── roomService.js    # Room management
│   ├── musicService.js   # Music operations
│   ├── youtubeService.js # YouTube integration
│   └── spotifyService.js # Spotify integration
├── sockets/              # Socket.IO handlers
│   ├── roomSocket.js     # Room-related events
│   └── musicSocket.js    # Music-related events
├── utils/                # Utility functions
│   ├── errors.js         # Custom error classes
│   └── helpers.js        # Helper functions
├── downloads/            # Downloaded audio files
├── public/               # Static files
├── app.js               # Express app configuration
├── index.js             # Server entry point
└── package.json         # Dependencies
```

## 🎯 Key Improvements

### **1. Separation of Concerns**
- **Routes**: Thin layer for request/response handling
- **Controllers**: Business logic and orchestration
- **Services**: Core domain logic
- **Middleware**: Cross-cutting concerns

### **2. Consistent Error Handling**
- Custom error classes with proper HTTP status codes
- Centralized error handling middleware
- Meaningful error messages and codes

### **3. Input Validation**
- Express-validator integration
- Reusable validation rules
- Proper sanitization

### **4. Response Standardization**
```javascript
// Success Response
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}

// Error Response
{
  "success": false,
  "error": "Error message",
  "statusCode": 400,
  "details": { ... }
}
```

### **5. Socket.IO Abstraction**
- Centralized socket event handling
- Type-safe event emissions
- Better organization of real-time features

### **6. Configuration Management**
- Environment-based configuration
- Centralized settings
- Easy deployment configuration

## 🚀 API Endpoints

### **Room Management**
```
POST   /api/rooms              # Create room
POST   /api/rooms/join         # Join room
GET    /api/rooms/:roomCode    # Get room details
DELETE /api/rooms/:roomCode    # Delete room
```

### **Queue Management**
```
GET    /api/queue/:roomCode              # Get queue
POST   /api/queue/:roomCode/add         # Add song
DELETE /api/queue/:roomCode/:index      # Remove song
PUT    /api/queue/:roomCode/move        # Reorder songs
```

### **Music Control**
```
GET    /api/music/sync/:roomCode        # Get playback state
GET    /api/music/stream/:filename      # Stream audio
POST   /api/music/playback/:roomCode    # Control playback
GET    /api/music/info/:filename        # Get audio info
```

### **Participant Management**
```
GET    /api/participants/:roomCode/participants      # Get participants
POST   /api/participants/:roomCode/participants     # Add participant
DELETE /api/participants/:roomCode/participants/:id # Remove participant
PUT    /api/participants/:roomCode/participants/:id # Update participant
```

## 🔧 Installation & Setup

### **Prerequisites**
- Node.js (v16 or higher)
- npm or yarn

### **Installation**
```bash
# Clone the repository
git clone <repository-url>
cd listentogether-server

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Start the server
npm start

# For development
npm run dev
```

### **Environment Variables**
```env
# Server Configuration
PORT=3000
HOST=localhost

# CORS Settings
ALLOWED_ORIGINS=http://localhost:4200,http://localhost:4201

# Room Settings  
MAX_PARTICIPANTS=20
INACTIVITY_TIMEOUT=7200000

# Download Settings
MAX_FILE_SIZE=104857600
CLEANUP_INTERVAL=86400000

# YouTube Settings
MAX_YOUTUBE_DURATION=600
YOUTUBE_QUALITY=highestaudio

# Spotify Settings
MAX_PLAYLIST_TRACKS=50

# Logging
LOG_LEVEL=info
LOG_FORMAT=combined
```

## 🏃‍♂️ Usage Examples

### **Creating a Room**
```javascript
const response = await fetch('/api/rooms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'John' })
});

const { data } = await response.json();
console.log('Room created:', data.room.code);
```

### **Adding a YouTube Song**
```javascript
const response = await fetch(`/api/queue/${roomCode}/add`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    songData: {
      youtubeUrl: 'https://www.youtube.com/watch?v=VIDEO_ID'
    },
    addedBy: 'John'
  })
});
```

### **Adding a Spotify Playlist**
```javascript
const response = await fetch(`/api/queue/${roomCode}/add`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    songData: {
      spotifyUrl: 'https://open.spotify.com/playlist/PLAYLIST_ID'
    },
    addedBy: 'John'
  })
});
```

## 📡 Socket.IO Events

### **Client → Server**
- `joinRoom(roomCode, userData)`
- `leaveRoom(roomCode)`
- `playbackControl(action, data)`

### **Server → Client**
- `queueUpdated(queueData)`
- `roomWorkingStateChanged(workingState)`
- `queueItemProgress(progressData)`
- `participantsUpdated(participants)`
- `roomStateChanged(roomState)`

## 🛠️ Development

### **Code Style**
- ESLint configuration for consistent code style
- Prettier for code formatting
- Clear naming conventions

### **Testing**
```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

### **Debugging**
```bash
# Start with debugging
npm run debug

# Enable verbose logging
LOG_LEVEL=debug npm start
```

## 🐛 Error Handling

The application uses custom error classes for different scenarios:

```javascript
// Room not found
throw new RoomNotFoundError(roomCode);

// Invalid URL
throw new InvalidUrlError(url, 'YouTube');

// Validation error
throw new ValidationError('Invalid room code', 'roomCode');
```

## 🔐 Security Features

- Input validation and sanitization
- CORS configuration
- Rate limiting (ready for implementation)
- Error message sanitization
- Secure file handling

## 📈 Performance Optimizations

- Async/await throughout
- Efficient file streaming
- Background download processing
- Memory-efficient queue management
- Connection pooling ready

## 🚀 Deployment

### **Production Build**
```bash
# Install production dependencies
npm ci --only=production

# Start production server
NODE_ENV=production npm start
```

### **Docker Support** (Ready for implementation)
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Follow the existing code style
4. Add tests for new functionality
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📝 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Projects

- **ListenTogether Client**: Frontend application (Angular/React)
- **ListenTogether Mobile**: Mobile app (React Native)

---

## 📞 Support

For support, please open an issue on GitHub or contact the development team.

**Happy Listening! 🎵**
