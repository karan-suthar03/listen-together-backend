const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class YouTubeService extends EventEmitter {
  constructor() {
    super();
    this.downloadQueue = new Map(); 
    this.downloadsDir = path.join(__dirname, '..', 'downloads');
    
    if (!fs.existsSync(this.downloadsDir)) {
      fs.mkdirSync(this.downloadsDir, { recursive: true });
    }
  }

  async getVideoInfo(url) {
    try {      
      const info = await ytdl.getInfo(url);
      const thumbnails = info.videoDetails.thumbnails;
      let bestThumbnail;
      
      bestThumbnail = thumbnails.find(t => t.width >= 320 && t.width <= 640);
      
      if (!bestThumbnail) {
        bestThumbnail = thumbnails
          .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
      }
      
      if (!bestThumbnail) {
        bestThumbnail = thumbnails[thumbnails.length - 1];
      }
      
      return {
        title: info.videoDetails.title,
        artist: info.videoDetails.author.name,
        duration: parseInt(info.videoDetails.lengthSeconds),
        thumbnail: bestThumbnail?.url || '',
        videoId: info.videoDetails.videoId,
        viewCount: info.videoDetails.viewCount,
        uploadDate: info.videoDetails.uploadDate,
        url: info.videoDetails.video_url
      };
    } catch (error) {
      console.error('Error getting video info:', error);
      throw new Error('Failed to get video information');
    }
  }

  async downloadVideo(videoId, url, roomCode, queueItemId) {
    const filename = `${videoId}.mp3`;
    const filePath = path.join(this.downloadsDir, filename);
    if (fs.existsSync(filePath)) {
      console.log(`File ${filename} already exists, skipping download`);
      
      this.emit('downloadProgress', {
        videoId,
        roomCode,
        queueItemId,
        progress: 100,
        status: 'completed'
      });
      
      this.emit('downloadComplete', {
        videoId,
        roomCode,
        queueItemId,
        filePath,
        filename,
        status: 'completed'
      });
      return { filePath, filename };
    }

    if (this.downloadQueue.has(videoId)) {
      console.log(`Download for ${videoId} already in progress`);
      return this.downloadQueue.get(videoId);
    }    const downloadPromise = new Promise((resolve, reject) => {
      const startTime = Date.now();
      let totalSize = 0;
      let downloadedSize = 0;
      let lastProgressEmit = 0; // Track when we last emitted progress

      try {
        const stream = ytdl(url, { 
          filter: 'audioonly',
          quality: 'highestaudio'
        });

        const writeStream = fs.createWriteStream(filePath);
        
        stream.on('response', (response) => {
          totalSize = parseInt(response.headers['content-length']) || 0;
          lastProgressEmit = Date.now();
          
          this.emit('downloadProgress', {
            videoId,
            roomCode,
            queueItemId,
            progress: 0,
            totalSize,
            downloadedSize: 0,
            status: 'downloading'
          });
        });

        stream.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const progress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;
          const now = Date.now();
          
          // Emit progress every 2 seconds instead of every 5%
          if (now - lastProgressEmit >= 2000) {
            lastProgressEmit = now;
            this.emit('downloadProgress', {
              videoId,
              roomCode,
              queueItemId,
              progress,
              totalSize,
              downloadedSize,
              status: 'downloading'
            });
          }
        });

        stream.on('error', (error) => {
          console.error('Download stream error:', error);
          
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          
          this.downloadQueue.delete(videoId);
          this.emit('downloadError', {
            videoId,
            roomCode,
            queueItemId,
            error: error.message,
            status: 'error'
          });
          
          reject(error);
        });

        stream.pipe(writeStream);        writeStream.on('finish', () => {
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`Downloaded ${filename} in ${elapsed} seconds`);
          
          // Emit final progress update immediately before completion
          this.emit('downloadProgress', {
            videoId,
            roomCode,
            queueItemId,
            progress: 100,
            totalSize,
            downloadedSize: totalSize,
            status: 'completed'
          });
          
          this.downloadQueue.delete(videoId);
          this.emit('downloadComplete', {
            videoId,
            roomCode,
            queueItemId,
            filePath,
            filename,
            downloadTime: elapsed,
            status: 'completed'
          });
          
          resolve({ filePath, filename });
        });

        writeStream.on('error', (error) => {
          console.error('Write stream error:', error);
          
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          
          this.downloadQueue.delete(videoId);
          this.emit('downloadError', {
            videoId,
            roomCode,
            queueItemId,
            error: error.message,
            status: 'error'
          });
          
          reject(error);
        });

      } catch (error) {
        this.downloadQueue.delete(videoId);
        this.emit('downloadError', {
          videoId,
          roomCode,
          queueItemId,
          error: error.message,
          status: 'error'
        });
        reject(error);
      }
    });

    this.downloadQueue.set(videoId, downloadPromise);
    return downloadPromise;
  }

  getDownloadStatus(videoId) {
    if (this.downloadQueue.has(videoId)) {
      return 'downloading';
    }
    
    const filename = `${videoId}.mp3`;
    const filePath = path.join(this.downloadsDir, filename);
    
    if (fs.existsSync(filePath)) {
      return 'completed';
    }
    
    return 'pending';
  }

  getFilePath(videoId) {
    const filename = `${videoId}.mp3`;
    const filePath = path.join(this.downloadsDir, filename);
    
    if (fs.existsSync(filePath)) {
      return { filePath, filename };
    }
    
    return null;
  }
}

module.exports = new YouTubeService();
