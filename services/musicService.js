const fs = require('fs');
const path = require('path');

class MusicService {
  constructor() {
    this.metadata = this.loadMetadata();
  }
  loadMetadata() {
    return {
      title: "",
      artist: "",
      album: "",
      duration: 0,
      coverUrl: "",
      mp3Url: "",
      year: null,
      genre: "",
      description: "No default music - queue-based only"
    };
  }
  async getMetadata() {
    return this.metadata;
  }  
  async initializePlayback(roomCode) {
    return {
      isPlaying: false,
      currentTime: 0,
      startedAt: null,
      lastUpdated: Date.now(),
      duration: 0, 
      queue: [], 
      currentTrackIndex: -1 
    };
  }

  getCurrentPosition(playbackState) {
    if (!playbackState.isPlaying) {
      return playbackState.currentTime;
    }

    const now = Date.now();
    const elapsed = (now - playbackState.lastUpdated) / 1000;
    const position = playbackState.currentTime + elapsed;
    
    return Math.min(position, playbackState.duration);
  }

  updatePlaybackState(playbackState, action, data = {}) {
    const now = Date.now();
    
    switch (action) {
      case 'play':
        playbackState.isPlaying = true;
        playbackState.lastUpdated = now;
        if (!playbackState.startedAt) {
          playbackState.startedAt = now;
        }
        break;
        
      case 'pause':
        playbackState.currentTime = this.getCurrentPosition(playbackState);
        playbackState.isPlaying = false;
        playbackState.lastUpdated = now;
        break;
        
      case 'seek':
        const seekTime = Math.max(0, Math.min(data.time || 0, playbackState.duration));
        playbackState.currentTime = seekTime;
        playbackState.lastUpdated = now;
        break;
      
      case 'stop':
        playbackState.isPlaying = false;
        playbackState.currentTime = 0;
        playbackState.lastUpdated = now;
        break;
        
      case 'next':
        this.nextTrack(playbackState);
        playbackState.lastUpdated = now;
        break;
        
      case 'previous':
        this.previousTrack(playbackState);
        playbackState.lastUpdated = now;
        break;      
      
      case 'playTrack':
        const trackIndex = data.trackIndex;
        if (trackIndex !== undefined) {
          this.playTrackAtIndex(playbackState, trackIndex);
          playbackState.lastUpdated = now;
        }
        break;
    }

    return playbackState;
  }
  addToQueue(playbackState, songData, addedBy) {
    const queueItem = {
      id: songData.id || (Date.now().toString() + Math.random().toString(36).substr(2, 9)), 
      title: songData.title,
      artist: songData.artist,
      duration: songData.duration,
      coverUrl: songData.coverUrl || null,
      mp3Url: songData.mp3Url || null,
      videoId: songData.videoId || null,
      youtubeUrl: songData.youtubeUrl || null,
      addedBy: addedBy,
      addedAt: new Date(),
      downloadStatus: songData.downloadStatus || 'completed',
      downloadProgress: songData.downloadProgress || 100
    };

    playbackState.queue.push(queueItem);
    return queueItem;
  }
  removeFromQueue(playbackState, index) {
    if (index >= 0 && index < playbackState.queue.length) {
      const removedItem = playbackState.queue.splice(index, 1)[0];
      
      if (playbackState.currentTrackIndex > index) {
        playbackState.currentTrackIndex--;
      } else if (playbackState.currentTrackIndex === index) {
        if (playbackState.queue.length > 0) {
          if (index < playbackState.queue.length) {
            playbackState.currentTrackIndex = index;
          } else {
            playbackState.currentTrackIndex = Math.max(0, playbackState.queue.length - 1);
          }
          
          const newCurrentTrack = playbackState.queue[playbackState.currentTrackIndex];
          if (newCurrentTrack) {
            playbackState.duration = newCurrentTrack.duration || 0;
            playbackState.currentTime = 0; 
          }
        } else {
          playbackState.currentTrackIndex = -1;
          playbackState.duration = 0;
          playbackState.currentTime = 0;
          playbackState.isPlaying = false;
        }
      }
      
      return removedItem;
    }
    return null;
  }

  moveQueueItem(playbackState, fromIndex, toIndex) {
    if (fromIndex >= 0 && fromIndex < playbackState.queue.length && 
        toIndex >= 0 && toIndex < playbackState.queue.length && 
        fromIndex !== toIndex) {
      
      const item = playbackState.queue.splice(fromIndex, 1)[0];
      playbackState.queue.splice(toIndex, 0, item);
      
      if (playbackState.currentTrackIndex === fromIndex) {
        playbackState.currentTrackIndex = toIndex;
      } else if (fromIndex < playbackState.currentTrackIndex && toIndex >= playbackState.currentTrackIndex) {
        playbackState.currentTrackIndex--;
      } else if (fromIndex > playbackState.currentTrackIndex && toIndex <= playbackState.currentTrackIndex) {
        playbackState.currentTrackIndex++;
      }
      
      return true;
    }
    return false;
  }

  getQueue(playbackState) {
    return {
      queue: playbackState.queue,
      currentTrackIndex: playbackState.currentTrackIndex
    };
  }  
  
  async getSyncData(playbackState) {
    let currentTrack = null;
    if (playbackState.currentTrackIndex >= 0 && playbackState.queue.length > playbackState.currentTrackIndex) {
      currentTrack = playbackState.queue[playbackState.currentTrackIndex];
    }
    
    return {
      isPlaying: playbackState.isPlaying,
      currentTime: this.getCurrentPosition(playbackState),
      lastUpdated: playbackState.lastUpdated,
      queue: playbackState.queue,
      currentTrackIndex: playbackState.currentTrackIndex,
      currentTrack: currentTrack,
      duration: currentTrack ? currentTrack.duration : 0
    };
  }

  nextTrack(playbackState) {
    if (playbackState.queue.length === 0) return;
    
    const nextIndex = playbackState.currentTrackIndex + 1;
    if (nextIndex < playbackState.queue.length) {
      this.playTrackAtIndex(playbackState, nextIndex);
    } else {
      playbackState.isPlaying = false;
      playbackState.currentTime = 0;
    }
  }

  previousTrack(playbackState) {
    if (playbackState.queue.length === 0) return;
    
    const prevIndex = playbackState.currentTrackIndex - 1;
    if (prevIndex >= 0) {
      this.playTrackAtIndex(playbackState, prevIndex);
    } else {
      playbackState.currentTime = 0;
      playbackState.isPlaying = true;
    }
  }
  playTrackAtIndex(playbackState, index) {
    console.log('🎵 PlayTrackAtIndex called:', { index, queueLength: playbackState.queue.length });
    
    if (index < 0 || index >= playbackState.queue.length) {
      console.log('🎵 Invalid index for playTrackAtIndex:', index);
      return;
    }
    
    const track = playbackState.queue[index];
    console.log('🎵 Track at index:', { title: track?.title, downloadStatus: track?.downloadStatus });
    
    if (!track || track.downloadStatus !== 'completed') {
      console.log('🎵 Track not available or not completed:', track?.downloadStatus);
      return;
    }
    
    console.log('🎵 Setting track as current:', { index, title: track.title });
    playbackState.currentTrackIndex = index;
    playbackState.currentTime = 0;
    playbackState.isPlaying = true;
    playbackState.duration = track.duration || 0;
  }

  checkTrackCompletion(playbackState) {
    const currentPosition = this.getCurrentPosition(playbackState);
    const duration = playbackState.duration;
    
    if (duration > 0 && currentPosition >= duration - 1) {
      this.nextTrack(playbackState);
      return true;
    }
    return false;
  }
}

module.exports = new MusicService();
