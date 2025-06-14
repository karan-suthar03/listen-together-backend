const path = require('path');
const fs = require('fs');
const roomService = require('../services/roomService');
const { createSuccessResponse, createErrorResponse } = require('../middleware/response');

class MusicController {
  async getPlaybackSync(req, res) {
    const { roomCode } = req.params;
    const syncData = await roomService.getPlaybackSync(roomCode);
    
    if (!syncData) {
      throw new Error('Room not found');
    }
    
    return createSuccessResponse(syncData, 'Playback sync data retrieved successfully');
  }

  async streamAudio(req, res) {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '..', 'downloads', filename);
    
    if (!fs.existsSync(filePath)) {
      throw new Error('Audio file not found');
    }
    
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg',
      };
      
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
      };
      
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  }

  async updatePlayback(req, res) {
    const { roomCode } = req.params;
    const { action, data } = req.body;
    
    const room = roomService.updatePlayback(roomCode, action, data);
    
    if (!room) {
      throw new Error('Room not found');
    }
    
    return createSuccessResponse({
      playback: room.playback,
      action: action
    }, `Playback ${action} successful`);
  }

  async getAudioInfo(req, res) {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '..', 'downloads', filename);
    
    if (!fs.existsSync(filePath)) {
      throw new Error('Audio file not found');
    }
    
    const stat = fs.statSync(filePath);
    
    return createSuccessResponse({
      filename,
      size: stat.size,
      lastModified: stat.mtime,
      exists: true
    }, 'Audio file info retrieved successfully');
  }
}

module.exports = new MusicController();
