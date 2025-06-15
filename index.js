const http = require('http');
const { Server } = require('socket.io');
const createApp = require('./app');
const config = require('./config/config');
const registerRoomSocket = require('./sockets/roomSocket');
const registerMusicSocket = require('./sockets/musicSocket');
const youtubeService = require('./services/youtubeService');
const roomService = require('./services/roomService');
const roomCleanupService = require('./services/roomCleanupService');
const supabaseService = require('./services/supabaseService');
const downloadManager = require('./services/downloadManager');

const port = config.server.port;
const io = new Server({
  cors: {
    origin: (origin, callback) => {
      // Allow all origins for ngrok testing
      callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: config.cors.credentials,
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
  },
});

const app = createApp(io);
const server = http.createServer(app);

io.attach(server);

registerRoomSocket(io);
registerMusicSocket(io);

// Set up room cleanup callback to notify clients when rooms are auto-deleted
roomCleanupService.setRoomDeletionCallback((roomCode, deletedRoom) => {
  console.log(`🗑️ Notifying clients about auto-deleted room: ${roomCode}`);
  
  // Emit to all clients in the room about the deletion
  io.to(roomCode).emit('room-deleted', {
    roomCode,
    reason: 'inactivity',
    message: 'Room was automatically deleted due to inactivity'
  });
  
  // Force disconnect all sockets from this room
  const sockets = io.sockets.adapter.rooms.get(roomCode);
  if (sockets) {
    sockets.forEach(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(roomCode);
        socket.emit('force-disconnect', {
          reason: 'room-deleted',
          message: 'You have been disconnected because the room was deleted due to inactivity'
        });
      }
    });
  }
});

// Periodic cleanup check (every 5 minutes) to ensure consistency
setInterval(() => {
  const rooms = roomService.rooms;
  const cleanupStatus = roomCleanupService.getCleanupStatus();
  
  console.log(`🔄 Periodic cleanup check - ${rooms.size} rooms, ${cleanupStatus.emptyRoomsBeingTracked} being tracked for cleanup`);
  
  // Check for any rooms that might have been missed
  rooms.forEach((room, roomCode) => {
    if (room.members.length === 0) {
      // Ensure empty rooms are being tracked
      roomCleanupService.handleRoomMembershipChange(roomCode);
    }
  });
}, 5 * 60 * 1000); // Every 5 minutes

youtubeService.on('downloadProgress', (data) => {
  const { roomCode, queueItemId, progress, status } = data;
  
  console.log('Download progress event:', { roomCode, queueItemId, progress, status });
  
  roomService.updateQueueItemStatus(roomCode, queueItemId, status, progress);
  
  io.to(roomCode).emit('queueItemProgress', {
    queueItemId,
    progress,
    status
  });
});

youtubeService.on('downloadComplete', (data) => {
  console.log('Download complete event received:', JSON.stringify(data, null, 2));
  
  const { roomCode, queueItemId, filename, publicUrl } = data;
  // Use publicUrl from Supabase instead of local streaming URL
  const mp3Url = publicUrl || `/api/music/stream/${filename}`;
  
  console.log('Processing download complete:', { roomCode, queueItemId, filename, mp3Url, publicUrl });
  
  const result = roomService.updateQueueItemStatus(roomCode, queueItemId, 'completed', 100, mp3Url);  
  console.log('Queue item updated:', result ? 'success' : 'failed');
  
  const room = roomService.getRoom(roomCode);
  console.log('Room lookup result:', room ? 'found' : 'not found', 'for roomCode:', roomCode);
  
  if (room && room.playback && room.playback.queue && room.playback.queue.length > 0 && room.playback.currentTrackIndex === -1) {
    const firstCompletedIndex = room.playback.queue.findIndex(track => track.downloadStatus === 'completed');
    if (firstCompletedIndex >= 0) {
      roomService.updatePlayback(roomCode, 'playTrack', { trackIndex: firstCompletedIndex });
      console.log(`Auto-playing first completed track at index ${firstCompletedIndex}`);
    }
  }
  
  io.to(roomCode).emit('queueItemComplete', {
    queueItemId,
    mp3Url,
    publicUrl,
    status: 'completed'
  });
  
  const syncData = roomService.getPlaybackSync(roomCode);
  syncData.then(data => {
    if (data) {
      io.to(roomCode).emit('music-state', data);
    }
  });
});

youtubeService.on('downloadError', (data) => {
  const { roomCode, queueItemId, error } = data;
  
  console.log('Download error event:', { roomCode, queueItemId, error });
  
  roomService.updateQueueItemStatus(roomCode, queueItemId, 'error', 0);
  
  io.to(roomCode).emit('queueItemError', {
    queueItemId,
    error,
    status: 'error'
  });
});

// Listen for download manager events
downloadManager.on('fileFoundPreDownloaded', (data) => {
  const { roomCode, queueItemId, videoId, mp3Url, status } = data;
  
  console.log('Pre-downloaded file found:', { roomCode, queueItemId, videoId, status });
  
  // Emit to room that this item is already completed
  io.to(roomCode).emit('queueItemComplete', {
    queueItemId,
    mp3Url,
    status: 'completed'
  });
  
  // Also emit general progress update
  io.to(roomCode).emit('queueItemProgress', {
    queueItemId,
    progress: 100,
    status: 'completed'
  });
});

server.listen(port, async () => {
  console.log(`Server listening at http://localhost:${port}`);
  console.log(`🗑️ Room cleanup service active - empty rooms will be deleted after ${roomCleanupService.EMPTY_ROOM_TIMEOUT / 1000 / 60} minutes of inactivity`);
  
  // Initialize Supabase bucket
  try {
    console.log('Initializing Supabase storage...');
    const bucketInitialized = await supabaseService.initializeBucket();
    if (bucketInitialized) {
      console.log('✅ Supabase storage initialized successfully');
    } else {
      console.warn('⚠️ Failed to initialize Supabase storage - check your configuration');
    }
  } catch (error) {
    console.error('❌ Error initializing Supabase:', error.message);
    console.warn('Server will continue running but file uploads may fail');
  }
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  roomCleanupService.clearAllTimers();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  roomCleanupService.clearAllTimers();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
