const roomService = require('../services/roomService');
const musicService = require('../services/musicService');

function registerMusicSocket(io) {
  io.on('connection', (socket) => {      socket.on('music-control', async ({ roomCode, action, data, userId }) => {
      const room = roomService.getRoom(roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const isUserInRoom = room.members && room.members.some(p => p.id === userId);
      if (!isUserInRoom) {
        socket.emit('error', { message: 'User not in room' });
        return;
      }

      const updatedRoom = roomService.updatePlayback(roomCode, action, data);
      if (updatedRoom) {
        const syncData = await roomService.getPlaybackSync(roomCode);
        io.to(roomCode).emit('music-state', syncData);
      }
    });socket.on('host-control', async ({ roomCode, action, data, userId }) => {
      const room = roomService.getRoom(roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      // Validate host permission server-side
      if (room.hostId !== userId) {
        socket.emit('error', { message: 'Only host can control playback' });
        return;
      }      const updatedRoom = roomService.updatePlayback(roomCode, action, data);
      if (updatedRoom) {
        const syncData = await roomService.getPlaybackSync(roomCode);
        io.to(roomCode).emit('music-state', syncData);
      }
    });
    
    socket.on('sync-request', async ({ roomCode }) => {
      const syncData = await roomService.getPlaybackSync(roomCode);
      if (syncData) {
        socket.emit('music-state', syncData);
      }
    });

    socket.on('get-music-meta', async () => {
      const metadata = await musicService.getMetadata();
      socket.emit('music-meta', metadata);
    });

  });
}

module.exports = registerMusicSocket;
