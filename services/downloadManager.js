const { EventEmitter } = require('events');
const youtubeService = require('./youtubeService');
const roomService = require('./roomService');

class DownloadManager extends EventEmitter {
  constructor() {
    super();
    this.roomDownloads = new Map();
    this.MAX_PREDOWNLOAD_COUNT = 2;
  }

  initializeRoom(roomCode) {
    if (!this.roomDownloads.has(roomCode)) {
      this.roomDownloads.set(roomCode, {
        currentlyDownloading: new Set(),
        downloadQueue: [],
        lastCurrentTrackIndex: -1
      });
    }
  }
  async addToDownloadQueue(roomCode, videoId, youtubeUrl, queueItemId) {
    this.initializeRoom(roomCode);
    const roomDownloadState = this.roomDownloads.get(roomCode);

    await this.checkAndUpdateExistingFile(roomCode, videoId, queueItemId);

    if (roomDownloadState.currentlyDownloading.has(videoId)) {
      console.log(`🔄 Song ${videoId} already downloading`);
      return;
    }

    await this.processDownloads(roomCode);
  }

  async checkAndUpdateExistingFile(roomCode, videoId, queueItemId) {
    try {
      const downloadStatus = await youtubeService.getDownloadStatus(videoId);

      if (downloadStatus === 'completed') {
        console.log(`✅ File ${videoId} already exists in Supabase, marking as completed`);

        const fileInfo = await youtubeService.getFilePath(videoId);
        const mp3Url = fileInfo ? fileInfo.publicUrl : '';

        roomService.updateQueueItemStatus(roomCode, queueItemId, 'completed', 100, mp3Url);

        this.emit('fileFoundPreDownloaded', {
          roomCode,
          queueItemId,
          videoId,
          mp3Url,
          status: 'completed'
        });

        return true;
      }
    } catch (error) {
      console.error(`Error checking existing file for ${videoId}:`, error);
    }

    return false;
  }

  async checkAllExistingFiles(roomCode) {
    const room = roomService.getRoom(roomCode);
    if (!room || !room.playback || !room.playback.queue) {
      return;
    }

    console.log(`🔍 Checking existing files for room ${roomCode} with ${room.playback.queue.length} songs`);

    for (const song of room.playback.queue) {
      if (song.downloadStatus === 'pending' && song.videoId && song.id) {
        const existed = await this.checkAndUpdateExistingFile(roomCode, song.videoId, song.id);
        if (existed) {
          console.log(`✅ Found existing file for: ${song.title}`);
        }
      }
    }
  }
  async processDownloads(roomCode) {
    const room = roomService.getRoom(roomCode);
    if (!room || !room.playback || !room.playback.queue) {
      return;
    }

    const roomDownloadState = this.roomDownloads.get(roomCode);
    if (!roomDownloadState) {
      return;
    }

    const currentTrackIndex = room.playback.currentTrackIndex;
    const queue = room.playback.queue;
    console.log(`🔄 Processing downloads for room ${roomCode}: currentTrack=${currentTrackIndex}, queueLength=${queue.length}`);

    await this.checkAllExistingFiles(roomCode);

    const songsToDownload = this.getSongsToDownload(queue, currentTrackIndex);

    console.log(`📊 Songs that should be downloaded:`, songsToDownload.map(s => ({ title: s.title, videoId: s.videoId, status: s.downloadStatus })));
    console.log(`📊 Currently downloading:`, Array.from(roomDownloadState.currentlyDownloading));

    for (const song of songsToDownload) {
      if (roomDownloadState.currentlyDownloading.has(song.videoId) || 
          song.downloadStatus === 'completed' || 
          song.downloadStatus === 'downloading') {
        continue;
      }

      console.log(`🔄 Should start download for: ${song.title} (${song.videoId}) - status: ${song.downloadStatus}`);

      if (song.youtubeUrl && song.id) {
        const downloadItem = {
          videoId: song.videoId,
          youtubeUrl: song.youtubeUrl,
          roomCode: roomCode,
          queueItemId: song.id,
          addedAt: Date.now()
        };

        console.log(`🚀 Starting download: ${song.title}`);
        this.startDownload(downloadItem).catch(error => {
          console.error(`Error starting download for ${song.videoId}:`, error);
        });
      }
    }

    roomDownloadState.lastCurrentTrackIndex = currentTrackIndex;
  }

  getSongsToDownload(queue, currentTrackIndex) {
    const songsToDownload = [];

    if (currentTrackIndex === -1 && queue.length > 0) {
      console.log(`📥 No current track, downloading first ${this.MAX_PREDOWNLOAD_COUNT} songs`);
      for (let i = 0; i < Math.min(this.MAX_PREDOWNLOAD_COUNT, queue.length); i++) {
        songsToDownload.push(queue[i]);
      }
    } else if (currentTrackIndex >= 0) {
      const startIndex = currentTrackIndex;
      const endIndex = Math.min(currentTrackIndex + this.MAX_PREDOWNLOAD_COUNT + 1, queue.length);

      console.log(`📥 Current track: ${currentTrackIndex}, downloading from ${startIndex} to ${endIndex - 1}`);

      for (let i = startIndex; i < endIndex; i++) {
        songsToDownload.push(queue[i]);
      }
    }

    return songsToDownload;
  }

  async startDownload(downloadItem) {
    const { videoId, youtubeUrl, roomCode, queueItemId } = downloadItem;
    const roomDownloadState = this.roomDownloads.get(roomCode);

    if (!roomDownloadState) {
      return;
    }

    roomDownloadState.currentlyDownloading.add(videoId);

    console.log(`🔄 Starting download: ${videoId} for room ${roomCode}`);

    try {
      roomService.updateQueueItemStatus(roomCode, queueItemId, 'downloading', 0);

      const result = await youtubeService.downloadVideo(videoId, youtubeUrl, roomCode, queueItemId);

      console.log(`✅ Download completed: ${videoId}`, result);

    } catch (error) {
      console.error(`❌ Download failed: ${videoId}`, error);
      roomService.updateQueueItemStatus(roomCode, queueItemId, 'error', 0);
    } finally {
      roomDownloadState.currentlyDownloading.delete(videoId);

      setTimeout(() => {
        this.processDownloads(roomCode).catch(err => {
          console.error('Error processing downloads after completion:', err);
        });
      }, 1000);
    }
  }

  async onTrackChange(roomCode, newCurrentTrackIndex) {
    console.log(`🎵 Track changed in room ${roomCode}: new index ${newCurrentTrackIndex}`);

    const roomDownloadState = this.roomDownloads.get(roomCode);
    if (!roomDownloadState) {
      return;
    }

    if (roomDownloadState.lastCurrentTrackIndex !== newCurrentTrackIndex) {
      await this.processDownloads(roomCode);
    }
  }

  cleanupRoom(roomCode) {
    if (this.roomDownloads.has(roomCode)) {
      console.log(`🧹 Cleaning up download state for room ${roomCode}`);
      this.roomDownloads.delete(roomCode);
    }
  }

  getRoomDownloadStats(roomCode) {
    const roomDownloadState = this.roomDownloads.get(roomCode);
    if (!roomDownloadState) {
      return {
        currentlyDownloading: 0,
        queuedForDownload: 0
      };
    }

    return {
      currentlyDownloading: roomDownloadState.currentlyDownloading.size,
      queuedForDownload: roomDownloadState.downloadQueue.length,
      downloadingItems: Array.from(roomDownloadState.currentlyDownloading),
      queuedItems: roomDownloadState.downloadQueue.map(item => item.videoId)
    };
  }
}

module.exports = new DownloadManager();
