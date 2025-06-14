const http = require('http');
const { Server } = require('socket.io');
const createApp = require('./app');
const config = require('./config/config');
const registerRoomSocket = require('./sockets/roomSocket');
const registerMusicSocket = require('./sockets/musicSocket');
const youtubeService = require('./services/youtubeService');
const roomService = require('./services/roomService');

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
  
  const { roomCode, queueItemId, filename } = data;
  const mp3Url = `/api/music/stream/${filename}`;
  
  console.log('Processing download complete:', { roomCode, queueItemId, filename, mp3Url });
  
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

server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
