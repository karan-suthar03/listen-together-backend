const crypto = require('crypto');
const roomService = require('../services/roomService');
const youtubeService = require('../services/youtubeService');
const spotifyService = require('../services/spotifyService');
const { createSuccessResponse } = require('../middleware/response');

class QueueController {
  constructor() {
    this.socketEmitter = null;
  }
  initializeSocket(io) {
    const SocketEmitter = require('../middleware/socketEmitter');
    this.socketEmitter = new SocketEmitter(io);
  }  async getQueue(req, res) {
    const { roomCode } = req.params;
    const room = roomService.getRoom(roomCode);
    
    if (!room) {
      throw new Error('Room not found');
    }

    const queueData = {
      queue: room.playback && room.playback.queue ? room.playback.queue : [],
      currentTrackIndex: room.playback ? room.playback.currentTrackIndex : -1,
      roomCode: roomCode
    };

    return createSuccessResponse(queueData, 'Queue retrieved successfully');
  }async addToQueue(req, res) {
    const { roomCode } = req.params;
    const { songData, addedBy } = req.body;

    try {
      let result;

      if (songData.youtubeUrl) {
        result = await this._processYouTubeUrl(roomCode, songData.youtubeUrl, addedBy);
      } else if (songData.spotifyUrl) {
        result = await this._processSpotifyUrl(roomCode, songData.spotifyUrl, addedBy);
      } else {
        throw new Error('Either YouTube URL or Spotify URL is required');
      }

      return createSuccessResponse(result, 'Added to queue successfully');
    } catch (error) {
      console.error('Operation error:', error);
      throw error;
    }
  }
  async removeFromQueue(req, res) {
    const { roomCode, index } = req.params;
    console.log('🗑️ Backend: Removing from queue:', { roomCode, index: parseInt(index) });
    
    const room = roomService.getRoom(roomCode);
    if (!room) {
      throw new Error('Room not found');
    }

    console.log('🗑️ Queue before removal:', { 
      length: room.playback.queue.length, 
      currentTrackIndex: room.playback.currentTrackIndex 
    });
    
    const result = roomService.removeFromQueue(roomCode, parseInt(index));
    
    if (!result) {      throw new Error('Failed to remove song from queue');
    }

    if (this.socketEmitter && result.room) {
      const syncData = await roomService.getPlaybackSync(roomCode);
      if (syncData) {
        this.socketEmitter.emitMusicState(roomCode, syncData);
      }
      
      this.socketEmitter.emitQueueUpdate(
        roomCode, 
        result.room.playback && result.room.playback.queue ? result.room.playback.queue : [],
        result.room.playback ? result.room.playback.currentTrackIndex : -1
      );
    }
    
    return createSuccessResponse({
      removedItem: result.removedItem,
      queueLength: result.room && result.room.playback && result.room.playback.queue ? result.room.playback.queue.length : 0
    }, 'Song removed from queue successfully');
  }

  async moveInQueue(req, res) {
    const { roomCode } = req.params;
    const { fromIndex, toIndex } = req.body;
    
    const result = roomService.moveInQueue(roomCode, fromIndex, toIndex);
    
    if (!result) {
      throw new Error('Failed to move song in queue');
    }

    if (this.socketEmitter && result.room) {
      this.socketEmitter.emitQueueUpdate(
        roomCode, 
        result.room.playback && result.room.playback.queue ? result.room.playback.queue : [],
        result.room.playback ? result.room.playback.currentTrackIndex : -1
      );
    }

    return createSuccessResponse({
      queue: result.room && result.room.playback && result.room.playback.queue ? result.room.playback.queue : [],
      currentTrackIndex: result.room && result.room.playback ? result.room.playback.currentTrackIndex : -1
    }, 'Song moved in queue successfully');
  }

  async _processYouTubeUrl(roomCode, youtubeUrl, addedBy) {
    const videoInfo = await youtubeService.getVideoInfo(youtubeUrl);
    if (!videoInfo) {
      throw new Error('Failed to get video information');
    }

    const queueItemId = crypto.randomBytes(16).toString('hex');
    
    const queueItem = {
      id: queueItemId,
      title: videoInfo.title,
      artist: videoInfo.uploader || 'Unknown',
      duration: videoInfo.duration || 0,
      youtubeUrl: youtubeUrl,
      videoId: videoInfo.id,
      coverUrl: videoInfo.thumbnail,
      addedBy: addedBy,
      addedAt: Date.now(),
      downloadStatus: 'pending',
      downloadProgress: 0,
      mp3Url: null,      source: 'youtube'
    };

    const result = roomService.addToQueue(roomCode, queueItem, addedBy);
    if (!result) {
      throw new Error('Failed to add song to queue');
    }

    if (this.socketEmitter) {
      this.socketEmitter.emitQueueUpdate(
        roomCode, 
        result.room.playback && result.room.playback.queue ? result.room.playback.queue : [],
        result.room.playback ? result.room.playback.currentTrackIndex : -1
      );
    }

    this._startDownload(videoInfo.id, youtubeUrl, roomCode, queueItemId);

    return {
      type: 'video',
      title: videoInfo.title,
      queueLength: result.room && result.room.playback && result.room.playback.queue ? result.room.playback.queue.length : 0,
      source: 'youtube'
    };
  }  async _processSpotifyUrl(roomCode, spotifyUrl, addedBy) {
    roomService.setRoomWorking(roomCode, true, 'Processing Spotify URL...');
    if (this.socketEmitter) {
      this.socketEmitter.emitWorkingStateChange(roomCode, true, 'Processing Spotify URL...');
    }

    try {
      const spotifyResult = await spotifyService.processSpotifyUrl(spotifyUrl);
      if (!spotifyResult) {
        throw new Error('Failed to process Spotify URL');
      }

      let result;
      if (spotifyResult.type === 'track') {
        result = await this._processSpotifyTrack(roomCode, spotifyResult, addedBy, spotifyUrl);
      } else if (spotifyResult.type === 'playlist') {
        result = await this._processSpotifyPlaylist(roomCode, spotifyResult, addedBy, spotifyUrl);
      } else {
        throw new Error('Unsupported Spotify URL type');
      }      console.log('Clearing working state on success');
      roomService.setRoomWorking(roomCode, false, '');
      if (this.socketEmitter) {
        console.log('Emitting working state change via socket: cleared');
        this.socketEmitter.emitWorkingStateChange(roomCode, false, '');
      }

      return result;    } catch (error) {
      console.log('Clearing working state on error:', error.message);
      roomService.setRoomWorking(roomCode, false, '');
      if (this.socketEmitter) {
        console.log('Emitting working state change via socket: cleared due to error');
        this.socketEmitter.emitWorkingStateChange(roomCode, false, '');
      }
      throw error;
    }
  }
  async _processSpotifyPlaylist(roomCode, spotifyResult, addedBy, originalUrl) {
    console.log(`Processing playlist: ${spotifyResult.name} with ${spotifyResult.tracks.length} tracks`);
    const playlistMessage = `Processing playlist: ${spotifyResult.name} (${spotifyResult.tracks.length} tracks)`;
    console.log('Setting working state for playlist:', playlistMessage);
    roomService.setRoomWorking(roomCode, true, playlistMessage);
    if (this.socketEmitter) {
      console.log('Emitting working state change via socket for playlist:', playlistMessage);
      this.socketEmitter.emitWorkingStateChange(roomCode, true, playlistMessage);
    }
    
    let successCount = 0;
    
    for (let i = 0; i < spotifyResult.tracks.length; i++) {
      try {
        const track = spotifyResult.tracks[i];
        console.log(`Processing track ${i + 1}/${spotifyResult.tracks.length}: ${track.spotifyTitle}`);
        const progressMessage = `Processing track ${i + 1}/${spotifyResult.tracks.length}: ${track.spotifyTitle}`;
        console.log('Updating working state progress:', progressMessage);
        roomService.setRoomWorking(roomCode, true, progressMessage);
        if (this.socketEmitter) {
          console.log('Emitting working state progress via socket:', progressMessage);
          this.socketEmitter.emitWorkingStateChange(roomCode, true, progressMessage);
        }
        
        if (track.youtubeUrl && track.videoId) {
          const queueItemId = crypto.randomBytes(16).toString('hex');
          
          const queueItem = {
            id: queueItemId,
            title: track.spotifyTitle,
            artist: track.spotifyArtist,
            duration: track.duration || 0,
            youtubeUrl: track.youtubeUrl,
            videoId: track.videoId,
            coverUrl: track.thumbnail || '',
            addedBy: addedBy,
            addedAt: Date.now(),
            downloadStatus: 'pending',
            downloadProgress: 0,
            mp3Url: null,
            source: 'spotify',            originalUrl: originalUrl,
            playlistName: spotifyResult.name
          };

          const result = roomService.addToQueue(roomCode, queueItem, addedBy);
          if (result) {
            successCount++;
            
            this._startDownload(track.videoId, track.youtubeUrl, roomCode, queueItemId);
          }
        }
      } catch (error) {
        console.error('Error adding track to queue:', track.spotifyTitle, error);
      }
    }
    
    const room = roomService.getRoom(roomCode);
    if (this.socketEmitter && room && room.playback && room.playback.queue) {
      this.socketEmitter.emitQueueUpdate(
        roomCode, 
        room.playback.queue, 
        room.playback.currentTrackIndex
      );
    }

    return { 
      type: 'playlist',
      playlistName: spotifyResult.name,
      tracksAdded: successCount,
      totalTracks: spotifyResult.originalTrackCount,
      queueLength: room && room.playback && room.playback.queue ? room.playback.queue.length : 0,
      source: 'spotify'
    };
  }

  async _processSpotifyTrack(roomCode, spotifyResult, addedBy, originalUrl) {
    const queueItemId = crypto.randomBytes(16).toString('hex');
    
    const queueItem = {
      id: queueItemId,
      title: spotifyResult.title,
      artist: spotifyResult.artist,
      duration: spotifyResult.duration || 0,
      youtubeUrl: spotifyResult.youtubeUrl,
      videoId: spotifyResult.videoId,
      coverUrl: spotifyResult.thumbnail || '',
      addedBy: addedBy,
      addedAt: Date.now(),
      downloadStatus: 'pending',
      downloadProgress: 0,
      mp3Url: null,      source: 'spotify',
      originalUrl: originalUrl
    };

    const result = roomService.addToQueue(roomCode, queueItem, addedBy);
    if (!result) {
      throw new Error('Failed to add song to queue');
    }

    if (this.socketEmitter) {
      this.socketEmitter.emitQueueUpdate(
        roomCode, 
        result.room.playback && result.room.playback.queue ? result.room.playback.queue : [],
        result.room.playback ? result.room.playback.currentTrackIndex : -1
      );
    }

    this._startDownload(spotifyResult.videoId, spotifyResult.youtubeUrl, roomCode, queueItemId);

    return {
      type: 'track',
      title: spotifyResult.title,
      artist: spotifyResult.artist,
      queueLength: result.room && result.room.playback && result.room.playback.queue ? result.room.playback.queue.length : 0,
      source: 'spotify'
    };
  }

  async playTrack(req, res) {
    const { roomCode, index } = req.params;
    const result = roomService.updatePlayback(roomCode, 'playTrack', { trackIndex: parseInt(index) });
    
    if (!result) {
      throw new Error('Failed to play track');
    }

    if (this.socketEmitter) {
      this.socketEmitter.emitQueueUpdate(
        roomCode, 
        result.playback && result.playback.queue ? result.playback.queue : [],
        result.playback ? result.playback.currentTrackIndex : -1
      );
    }

    return createSuccessResponse({
      currentTrackIndex: result.playback ? result.playback.currentTrackIndex : -1,
      queueLength: result.playback && result.playback.queue ? result.playback.queue.length : 0,
      isPlaying: result.playback ? result.playback.isPlaying : false
    }, 'Track is now playing');
  }

  _startDownload(videoId, youtubeUrl, roomCode, queueItemId) {
    youtubeService.downloadVideo(videoId, youtubeUrl, roomCode, queueItemId)
      .catch(error => {
        console.error('Download failed:', error);
        roomService.updateQueueItemStatus(roomCode, queueItemId, 'error', 0);
      });
  }
}

module.exports = new QueueController();
