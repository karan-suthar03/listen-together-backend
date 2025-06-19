const ytdl = require('@distube/ytdl-core');
const {getTrackData} = require('@hydralerne/youtube-api');
const fs = require('fs');
const path = require('path');
const {EventEmitter} = require('events');
const supabaseService = require('./supabaseService');

class YouTubeService extends EventEmitter {
    constructor() {
        super();
        this.downloadQueue = new Map();
        this.downloadsDir = path.join(__dirname, '..', 'downloads');

        if (!fs.existsSync(this.downloadsDir)) {
            fs.mkdirSync(this.downloadsDir, {recursive: true});
        }        // Listen to upload progress events from SupabaseService
        supabaseService.on('uploadProgress', (data) => {
            const {videoId, roomCode, queueItemId, progress, status} = data;
            // Map upload progress (0-100%) to second 50% of total progress (50-100%)
            const totalProgress = 50 + Math.round(progress * 0.5);
            
            console.log(`🔄 Upload progress: ${videoId} - ${progress}% upload -> ${totalProgress}% total`);
            
            this.emit('downloadProgress', {
                videoId,
                roomCode,
                queueItemId,
                progress: totalProgress,
                status: status === 'completed' ? 'completed' : 'uploading'
            });
        });
    }

    // Helper function to extract video ID from YouTube URL
    extractVideoId(url) {
        const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    async getVideoInfo(url) {
        try {
            const videoId = this.extractVideoId(url);
            if (!videoId) {
                throw new Error('Invalid YouTube URL or could not extract video ID');
            }
            // Try the fast YouTube API first
            try {
                const trackData = await getTrackData(videoId);

                if (trackData.error) {
                    console.warn(`YouTube API returned error: ${trackData.error}, falling back to ytdl`);
                    throw new Error(`YouTube API error: ${trackData.error}`);
                }

                return {
                    title: trackData.title || 'Unknown Title',
                    artist: trackData.artist || 'Unknown Artist',
                    duration: Math.floor((trackData.duration || 0) / 1000),
                    thumbnail: trackData.poster || '',
                    videoId: videoId,
                    viewCount: trackData.viewCount || 0,
                    uploadDate: trackData.uploadDate || null,
                    url: url
                };

            } catch (apiError) {
                console.warn(`🎵 Fast API failed: ${apiError.message}, falling back to ytdl.getInfo()`);

                // Fallback to ytdl.getInfo()        const info = await ytdl.getInfo(url);
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
            }

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
                filePath: null,
                filename,
                publicUrl,
                status: 'completed'
            });
            return {filename, publicUrl};
        }

        if (this.downloadQueue.has(videoId)) {
            return this.downloadQueue.get(videoId);
        }

        const downloadPromise = new Promise(async (resolve, reject) => {
            const startTime = Date.now();
            let totalSize = 0;
            let downloadedSize = 0;
            let lastProgressEmit = 0;

            try {
                let stream;
                try {
                    stream = ytdl(url, {
                        filter: 'audioonly',
                        quality: 'highestaudio'
                    });
                } catch (ytdlError) {
                    console.error(`Failed to create ytdl stream:`, ytdlError);
                    throw ytdlError;
                }

                const writeStream = fs.createWriteStream(filePath);                stream.on('response', (response) => {
                    totalSize = parseInt(response.headers['content-length']) || 0;
                    lastProgressEmit = Date.now();

                    console.log(`🎬 Starting download: ${videoId} - ${totalSize} bytes`);

                    this.emit('downloadProgress', {
                        videoId,
                        roomCode,
                        queueItemId,
                        progress: 0,
                        totalSize,
                        downloadedSize: 0,
                        status: 'downloading'
                    });
                });stream.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    const downloadProgress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;
                    // Map download progress to first 50% of total progress
                    const totalProgress = Math.round(downloadProgress * 0.5);
                    const now = Date.now();
                    // Emit progress every 2 seconds
                    if (now - lastProgressEmit >= 2000) {
                        lastProgressEmit = now;
                        console.log(`⬇️ Download progress: ${videoId} - ${downloadProgress}% download -> ${totalProgress}% total`);
                        this.emit('downloadProgress', {
                            videoId,
                            roomCode,
                            queueItemId,
                            progress: Math.min(totalProgress, 50), // Cap at 50% for download phase
                            totalSize,
                            downloadedSize,
                            status: 'downloading'
                        });
                    }
                });

                stream.on('error', (error) => {
                    console.error(`❌ Download stream error for ${videoId}:`, error);

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
                stream.pipe(writeStream);                writeStream.on('finish', async () => {
                    const elapsed = (Date.now() - startTime) / 1000;
                    try {
                        // Emit progress update for end of download phase (50%)
                        this.emit('downloadProgress', {
                            videoId,
                            roomCode,
                            queueItemId,
                            progress: 50,
                            totalSize,
                            downloadedSize: totalSize,
                            status: 'uploading'
                        });

                        // Upload to Supabase with upload progress tracking
                        const uploadResult = await supabaseService.uploadFile(filePath, filename, {
                            videoId,
                            roomCode,
                            queueItemId,
                            uploadedAt: new Date().toISOString()
                        }, {
                            videoId,
                            roomCode,
                            queueItemId
                        });                        if (uploadResult.success) {
                            // Clean up local file
                            await supabaseService.cleanupLocalFile(filePath);

                            // Final completion will be emitted by SupabaseService upload progress
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

                            resolve({filename, publicUrl: uploadResult.publicUrl});
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
            return {filename, publicUrl};
        }

        return null;
    }
}

module.exports = new YouTubeService();
