const crypto = require('crypto');
const musicService = require('./musicService');
const downloadManager = require('./downloadManager');
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateUserId() {
  return crypto.randomUUID();
}

exports.createRoom = async (hostName = 'Host') => {
  let code;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));
  const userId = generateUserId();
  const user = { 
    id: userId, 
    name: hostName, 
    isHost: true,
    joinedAt: Date.now()
  };  
  const room = { 
    code, 
    hostId: userId, 
    members: [user],
    playback: await musicService.initializePlayback(code),
    isWorking: false,
    workingMessage: '',
    createdAt: Date.now()
  };
  rooms.set(code, room);
    // Initialize download manager for this room
  downloadManager.initializeRoom(code);
  
  // Check for existing files in case there are any pre-existing downloads
  setTimeout(() => {
    downloadManager.checkAllExistingFiles(code).catch(error => {
      console.error('Error checking existing files on room creation:', error);
    });
  }, 1000);
  
  return { room, user };
};

exports.joinRoom = async (code, name = 'Guest') => {
  const room = rooms.get(code);
  if (!room) return null;
  const userId = generateUserId();
  const user = { 
    id: userId, 
    name, 
    isHost: false,
    joinedAt: Date.now()
  };
  room.members.push(user);
  return { room, user };
};

exports.getRoom = (code) => rooms.get(code);
exports.rooms = rooms;

exports.updatePlayback = (roomCode, action, data = {}) => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  const previousTrackIndex = room.playback.currentTrackIndex;
  
  room.playback = musicService.updatePlaybackState(room.playback, action, data);
  
  // Check if track changed and notify download manager
  if (room.playback.currentTrackIndex !== previousTrackIndex) {
    console.log(`🎵 Track changed from ${previousTrackIndex} to ${room.playback.currentTrackIndex} in room ${roomCode}`);
    downloadManager.onTrackChange(roomCode, room.playback.currentTrackIndex).catch(error => {
      console.error('Error notifying download manager of track change:', error);
    });
  }
  
  return room;
};

exports.getPlaybackSync = async (roomCode) => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  return await musicService.getSyncData(room.playback);
};

exports.getParticipants = (roomCode) => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  return room.members.map(member => ({
    id: member.id,
    name: member.name,
    isHost: member.isHost,
    joinedAt: member.joinedAt,
    isConnected: true 
  }));
};

exports.addParticipant = (roomCode, user) => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  const existingUser = room.members.find(m => m.id === user.id);
  if (existingUser) return room;
  
  const userWithTimestamp = {
    ...user,
    joinedAt: Date.now()
  };
  
  room.members.push(userWithTimestamp);
  return room;
};

exports.removeParticipant = (roomCode, userId) => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  const userIndex = room.members.findIndex(m => m.id === userId);
  if (userIndex === -1) return room;
  
  const removedUser = room.members[userIndex];
  room.members.splice(userIndex, 1);
    return { room, removedUser };
};

exports.addToQueue = (roomCode, songData, addedBy) => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  const queueItem = musicService.addToQueue(room.playback, songData, addedBy);
  
  // Initialize download manager for this room if needed
  downloadManager.initializeRoom(roomCode);
  
  // Trigger download processing for this room
  downloadManager.processDownloads(roomCode).catch(error => {
    console.error('Error processing downloads after adding to queue:', error);
  });
  
  return { room, queueItem };
};

exports.removeFromQueue = (roomCode, index) => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  const removedItem = musicService.removeFromQueue(room.playback, index);
  return { room, removedItem };
};

exports.moveQueueItem = (roomCode, fromIndex, toIndex) => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  const success = musicService.moveQueueItem(room.playback, fromIndex, toIndex);
  return success ? room : null;
};

exports.getQueue = (roomCode) => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  return musicService.getQueue(room.playback);
};

exports.updateQueueItemStatus = (roomCode, queueItemId, status, progress = 0, mp3Url = '') => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  const queueItem = room.playback.queue.find(item => item.id === queueItemId);
  if (!queueItem) return null;
  
  queueItem.downloadStatus = status;
  queueItem.downloadProgress = progress;
  
  if (mp3Url) {
    queueItem.mp3Url = mp3Url;
  }
  
  return { room, queueItem };
};

exports.setRoomWorking = (roomCode, isWorking, message = '') => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  room.isWorking = isWorking;
  room.workingMessage = message;
  
  return room;
};

exports.getRoomWorking = (roomCode) => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  return {
    isWorking: room.isWorking,
    workingMessage: room.workingMessage
  };
};

exports.updateParticipant = (roomCode, userId, updateData) => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  const user = room.members.find(m => m.id === userId);
  if (!user) return null;
  
  Object.assign(user, updateData, {
    id: user.id,
    joinedAt: user.joinedAt
  });
  
  return room;
};

exports.deleteRoom = async (roomCode) => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  // Clean up download manager state for this room
  downloadManager.cleanupRoom(roomCode);
  
  rooms.delete(roomCode);  return room;
};

exports.getRoom = (roomCode) => {
  const room = rooms.get(roomCode);
  if (!room) return null;
  
  // Return room data with participant information
  return {
    code: room.code,
    hostId: room.hostId,
    createdAt: room.createdAt,
    isWorking: room.isWorking,
    workingMessage: room.workingMessage,
    members: room.members.map(member => ({
      id: member.id,
      name: member.name,
      isHost: member.isHost,
      joinedAt: member.joinedAt
    })),
    playback: {
      isPlaying: room.playback.isPlaying,
      currentTime: room.playback.currentTime,
      currentTrack: room.playback.queue[room.playback.currentTrackIndex] || null,
      queueLength: room.playback.queue.length
    }
  };
};

exports.getRoomStats = () => {
  return {
    totalRooms: rooms.size,
    totalParticipants: Array.from(rooms.values()).reduce((sum, room) => sum + room.members.length, 0),
    activeRooms: Array.from(rooms.values()).filter(room => room.playback.isPlaying).length
  };
};
