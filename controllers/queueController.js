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
  }  
  
  async getQueue(req, res) {
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
  }
  
  async addToQueue(req, res) {
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
    
    if (!result) {      
      throw new Error('Failed to remove song from queue');
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
    }    // Check if this video is already in the queue
    const room = roomService.getRoom(roomCode);
    console.log(`🔍 YouTube duplicate check - Room found: ${!!room}, Queue length: ${room?.playback?.queue?.length || 0}`);
    
    if (room?.playback?.queue) {
      console.log(`🔍 Current queue video IDs:`, room.playback.queue.map(item => ({ title: item.title, videoId: item.videoId })));
    }
    const existingTrack = room?.playback?.queue?.find(item => {
      console.log(`🔍 Comparing YouTube: "${item.videoId}" === "${videoInfo.videoId}"`);
      return item.videoId === videoInfo.videoId;
    });
    
    if (existingTrack) {
      console.log(`🎵 Skipping duplicate YouTube video: ${videoInfo.title} (Video ID: ${videoInfo.videoId})`);
      console.log(`🎵 Existing track: ${existingTrack.title} (Video ID: ${existingTrack.videoId})`);
      throw new Error('This song is already in the queue');
    }
    
    console.log(`✅ No duplicate found for YouTube: ${videoInfo.title} (Video ID: ${videoInfo.videoId})`);

    const queueItemId = crypto.randomBytes(16).toString('hex');
      const queueItem = {
      id: queueItemId,
      title: videoInfo.title,
      artist: videoInfo.artist || 'Unknown',
      duration: videoInfo.duration || 0,
      youtubeUrl: youtubeUrl,
      videoId: videoInfo.videoId,
      coverUrl: videoInfo.thumbnail,
      addedBy: addedBy,
      addedAt: Date.now(),
      downloadStatus: 'pending',
      downloadProgress: 0,
      mp3Url: null,      
      source: 'youtube'
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

    this._startDownload(videoInfo.videoId, youtubeUrl, roomCode, queueItemId);

    return {
      type: 'video',
      title: videoInfo.title,
      queueLength: result.room && result.room.playback && result.room.playback.queue ? result.room.playback.queue.length : 0,
      source: 'youtube'
    };
  }  
  
  async _processSpotifyUrl(roomCode, spotifyUrl, addedBy) {
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
  }  async _processSpotifyPlaylist(roomCode, spotifyResult, addedBy, originalUrl) {
    console.log(`Processing playlist: ${spotifyResult.name} with ${spotifyResult.tracks.length} tracks`);
    const playlistMessage = `Processing playlist: ${spotifyResult.name} (${spotifyResult.tracks.length} tracks)`;
    console.log('Setting working state for playlist:', playlistMessage);
    roomService.setRoomWorking(roomCode, true, playlistMessage);
    if (this.socketEmitter) {
      console.log('Emitting working state change via socket for playlist:', playlistMessage);
      this.socketEmitter.emitWorkingStateChange(roomCode, true, playlistMessage);
    }
    
    const stats = { successCount: 0 }; // Use object to maintain reference
    const downloadQueue = [];
    
    // Start downloads in background as tracks get processed
    this._startStreamingDownloads(downloadQueue);
    
    // Process tracks asynchronously - each track gets added to queue as soon as its details are processed
    const processTrack = async (track, index) => {
      try {
        console.log(`Processing track ${index + 1}/${spotifyResult.tracks.length}: ${track.title || track.name}`);
        const progressMessage = `Processing track ${index + 1}/${spotifyResult.tracks.length}: ${track.title || track.name}`;
        
        // Update progress for each track being processed
        roomService.setRoomWorking(roomCode, true, progressMessage);
        if (this.socketEmitter) {
          this.socketEmitter.emitWorkingStateChange(roomCode, true, progressMessage);
        }
        
        // Process the Spotify track to get YouTube details
        console.log(`🎵 Starting YouTube lookup for: ${track.title || track.name}`);
        const processedTrack = await spotifyService.processSpotifyTrackFromPlaylist(
          track, 
          spotifyResult.name, 
          originalUrl, 
          index
        );
        
        console.log(`🎵 YouTube lookup result:`, processedTrack ? 'Found' : 'Not found');        if (processedTrack && processedTrack.youtubeUrl && processedTrack.videoId) {
          // Check if this song is already in the queue
          const room = roomService.getRoom(roomCode);
          console.log(`🔍 Checking for duplicates - Room found: ${!!room}, Queue length: ${room?.playback?.queue?.length || 0}`);
          
          if (room?.playback?.queue) {
            console.log(`🔍 Current queue video IDs:`, room.playback.queue.map(item => ({ title: item.title, videoId: item.videoId })));
          }
          
          const existingTrack = room?.playback?.queue?.find(item => {
            console.log(`🔍 Comparing: "${item.videoId}" === "${processedTrack.videoId}"`);
            return item.videoId === processedTrack.videoId;
          });
          
          if (existingTrack) {
            console.log(`🎵 Skipping duplicate track: ${processedTrack.spotifyTitle} (Video ID: ${processedTrack.videoId})`);
            console.log(`🎵 Existing track: ${existingTrack.title} (Video ID: ${existingTrack.videoId})`);
            return;
          }
          
          console.log(`✅ No duplicate found for: ${processedTrack.spotifyTitle} (Video ID: ${processedTrack.videoId})`);
          
          const queueItemId = crypto.randomBytes(16).toString('hex');
          
          const queueItem = {
            id: queueItemId,
            title: processedTrack.spotifyTitle,
            artist: processedTrack.spotifyArtist,
            duration: processedTrack.duration || 0,
            youtubeUrl: processedTrack.youtubeUrl,
            videoId: processedTrack.videoId,
            coverUrl: processedTrack.thumbnail || '',
            addedBy: addedBy,
            addedAt: Date.now(),
            downloadStatus: 'pending',
            downloadProgress: 0,
            mp3Url: null,
            source: 'spotify',
            originalUrl: originalUrl,
            playlistName: spotifyResult.name
          };

          console.log(`🎵 Adding to queue: ${queueItem.title}`);
          const result = roomService.addToQueue(roomCode, queueItem, addedBy);
          if (result) {
            stats.successCount++;
            console.log(`🎵 Successfully added to queue: ${queueItem.title} (${stats.successCount} total)`);
            
            // Add to download queue
            downloadQueue.push({
              videoId: processedTrack.videoId,
              youtubeUrl: processedTrack.youtubeUrl,
              roomCode: roomCode,
              queueItemId: queueItemId
            });
            
            console.log(`🎵 Added to download queue: ${processedTrack.videoId}`);
            
            // Emit queue update immediately after adding each track
            if (this.socketEmitter) {
              this.socketEmitter.emitQueueUpdate(
                roomCode, 
                result.room.playback.queue, 
                result.room.playback.currentTrackIndex
              );
            }
          } else {
            console.error(`🎵 Failed to add to room queue: ${queueItem.title}`);
          }
        } else {
          console.warn(`🎵 Skipping track - no YouTube match: ${track.title || track.name}`);
        }
        
      } catch (error) {
        console.error('🎵 Error processing track:', track.title || track.name, error);
      }
    };
    
    // Process tracks with controlled concurrency for details fetching
    const processingLimit = 2; // Process max 2 track details simultaneously
    const processingPromises = []; 
    
    for (let i = 0; i < Math.min(processingLimit, spotifyResult.tracks.length); i++) {
      processingPromises.push(this._processTracksSequentially(spotifyResult.tracks, i, processingLimit, processTrack));
    }
      // Wait for all track processing to complete
    await Promise.allSettled(processingPromises);
    
    const room = roomService.getRoom(roomCode);

    return { 
      type: 'playlist',
      playlistName: spotifyResult.name,
      tracksAdded: stats.successCount,
      totalTracks: spotifyResult.originalTrackCount,
      queueLength: room && room.playback && room.playback.queue ? room.playback.queue.length : 0,
      source: 'spotify'
    };
  }
  
  async _processTracksSequentially(tracks, startIndex, step, processTrack) {
    for (let i = startIndex; i < tracks.length; i += step) {
      await processTrack(tracks[i], i);
    }
  }  
  
  async _processSpotifyTrack(roomCode, spotifyResult, addedBy, originalUrl) {
    // Check if this track is already in the queue
    const room = roomService.getRoom(roomCode);
    console.log(`🔍 Spotify track duplicate check - Room found: ${!!room}, Queue length: ${room?.playback?.queue?.length || 0}`);
    
    if (room?.playback?.queue) {
      console.log(`🔍 Current queue video IDs:`, room.playback.queue.map(item => ({ title: item.title, videoId: item.videoId })));
    }
    
    const existingTrack = room?.playback?.queue?.find(item => {
      console.log(`🔍 Comparing Spotify track: "${item.videoId}" === "${spotifyResult.videoId}"`);
      return item.videoId === spotifyResult.videoId;
    });
    
    if (existingTrack) {
      console.log(`🎵 Skipping duplicate Spotify track: ${spotifyResult.title} (Video ID: ${spotifyResult.videoId})`);
      console.log(`🎵 Existing track: ${existingTrack.title} (Video ID: ${existingTrack.videoId})`);
      throw new Error('This song is already in the queue');
    }
    
    console.log(`✅ No duplicate found for Spotify track: ${spotifyResult.title} (Video ID: ${spotifyResult.videoId})`);
    
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
  _startStreamingDownloads(downloadQueue) {
    console.log('🔄 Starting streaming downloads...');
    
    // Monitor the download queue and start downloads as items are added
    const concurrentLimit = 3; // Download max 3 songs simultaneously
    let currentDownloads = 0;
    let processedCount = 0;
    
    const processDownloads = () => {
      console.log(`🔄 processDownloads called: queue=${downloadQueue.length}, active=${currentDownloads}, limit=${concurrentLimit}`);
      
      while (downloadQueue.length > 0 && currentDownloads < concurrentLimit) {
        const downloadItem = downloadQueue.shift();
        currentDownloads++;
        processedCount++;
        
        console.log(`🔄 Starting download ${processedCount}: ${downloadItem.videoId} (${currentDownloads} active downloads)`);
        
        youtubeService.downloadVideo(
          downloadItem.videoId, 
          downloadItem.youtubeUrl, 
          downloadItem.roomCode, 
          downloadItem.queueItemId
        )
        .then(() => {
          console.log(`✅ Download completed: ${downloadItem.videoId}`);
        })
        .catch(error => {
          console.error('❌ Download failed:', downloadItem.videoId, error);
          roomService.updateQueueItemStatus(downloadItem.roomCode, downloadItem.queueItemId, 'error', 0);
        })        .finally(() => {
          currentDownloads--;
          console.log(`🔄 Download finished for ${downloadItem.videoId}, active downloads: ${currentDownloads}`);
          // Immediately check for more downloads when one completes
          setImmediate(() => processDownloads());
        });
      }
    };
    
    // Start initial downloads
    processDownloads();
      // Check for new downloads periodically
    const checkInterval = setInterval(() => {
      if (downloadQueue.length > 0) {
        console.log(`🔄 Periodic check: found ${downloadQueue.length} items in queue, processing...`);
        processDownloads();
      }
    }, 1000); // Check every second
    
    // Keep the interval running longer to handle delayed additions
    setTimeout(() => {
      clearInterval(checkInterval);
      console.log('🔄 Stopping periodic download checks after timeout');
    }, 60000); // Stop after 1 minute
  }
  
  _startPlaylistDownloads(downloadQueue) {
    console.log(`Starting concurrent downloads for ${downloadQueue.length} tracks`);
    
    // Process downloads concurrently with a limit to avoid overwhelming the system
    const concurrentLimit = 3; // Download max 3 songs simultaneously
    let currentDownloads = 0;
    let queueIndex = 0;
    
    const processNextDownload = () => {
      if (queueIndex >= downloadQueue.length || currentDownloads >= concurrentLimit) {
        return;
      }
      
      const downloadItem = downloadQueue[queueIndex++];
      currentDownloads++;
      
      console.log(`Starting download ${queueIndex}/${downloadQueue.length}: ${downloadItem.videoId}`);
      
      youtubeService.downloadVideo(
        downloadItem.videoId, 
        downloadItem.youtubeUrl, 
        downloadItem.roomCode, 
        downloadItem.queueItemId
      )
      .then(() => {
        console.log(`Download completed: ${downloadItem.videoId}`);
      })
      .catch(error => {
        console.error('Download failed:', downloadItem.videoId, error);
        roomService.updateQueueItemStatus(downloadItem.roomCode, downloadItem.queueItemId, 'error', 0);
      })
      .finally(() => {
        currentDownloads--;
        // Start next download when one completes
        processNextDownload();
      });
      
      // Start next download immediately if under limit
      processNextDownload();
    };
    
    // Start initial batch of downloads
    processNextDownload();
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
