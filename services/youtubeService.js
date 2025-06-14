const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const supabaseService = require('./supabaseService');

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
    
    // Check if file already exists in Supabase
    const fileExistsInSupabase = await supabaseService.fileExists(filename);
    if (fileExistsInSupabase) {
      console.log(`File ${filename} already exists in Supabase, getting URL`);
      const publicUrl = supabaseService.getPublicUrl(filename);
      
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
        filePath: null, // No local path
        filename,
        publicUrl, // Add Supabase public URL
        status: 'completed'
      });
      return { filename, publicUrl };
    }

    if (this.downloadQueue.has(videoId)) {
      console.log(`Download for ${videoId} already in progress`);
      return this.downloadQueue.get(videoId);
    }

    const downloadPromise = new Promise(async (resolve, reject) => {
      const startTime = Date.now();
      let totalSize = 0;
      let downloadedSize = 0;
      let lastProgressEmit = 0;

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
          
          // Emit progress every 2 seconds
          if (now - lastProgressEmit >= 2000) {
            lastProgressEmit = now;
            this.emit('downloadProgress', {
              videoId,
              roomCode,
              queueItemId,
              progress: Math.min(progress, 95), // Cap at 95% until upload is complete
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

        stream.pipe(writeStream);

        writeStream.on('finish', async () => {
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`Downloaded ${filename} in ${elapsed} seconds, now uploading to Supabase...`);
          
          try {
            // Emit progress update for upload phase
            this.emit('downloadProgress', {
              videoId,
              roomCode,
              queueItemId,
              progress: 95,
              totalSize,
              downloadedSize: totalSize,
              status: 'uploading'
            });

            // Upload to Supabase
            const uploadResult = await supabaseService.uploadFile(filePath, filename, {
              videoId,
              roomCode,
              queueItemId,
              uploadedAt: new Date().toISOString()
            });

            if (uploadResult.success) {
              console.log(`Successfully uploaded ${filename} to Supabase`);
              
              // Clean up local file
              await supabaseService.cleanupLocalFile(filePath);
              
              // Emit final completion
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
                filePath: null, // No local path since we cleaned it up
                filename,
                publicUrl: uploadResult.publicUrl,
                downloadTime: elapsed,
                status: 'completed'
              });
              
              resolve({ filename, publicUrl: uploadResult.publicUrl });
            } else {
              throw new Error(`Upload failed: ${uploadResult.error}`);
            }
          } catch (uploadError) {
            console.error('Upload to Supabase failed:', uploadError);
            
            // Clean up local file even if upload failed
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            
            this.downloadQueue.delete(videoId);
            this.emit('downloadError', {
              videoId,
              roomCode,
              queueItemId,
              error: `Upload failed: ${uploadError.message}`,
              status: 'error'
            });
            
            reject(uploadError);
          }
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
  async getDownloadStatus(videoId) {
    if (this.downloadQueue.has(videoId)) {
      return 'downloading';
    }
    
    // Check if file exists in Supabase
    const filename = `${videoId}.mp3`;
    const fileExistsInSupabase = await supabaseService.fileExists(filename);
    
    if (fileExistsInSupabase) {
      return 'completed';
    }
    
    return 'pending';
  }

  async getFilePath(videoId) {
    const filename = `${videoId}.mp3`;
    
    // Check if file exists in Supabase and return public URL
    const fileExistsInSupabase = await supabaseService.fileExists(filename);
    
    if (fileExistsInSupabase) {
      const publicUrl = supabaseService.getPublicUrl(filename);
      return { filename, publicUrl };
    }
    
    return null;
  }
}

module.exports = new YouTubeService();
