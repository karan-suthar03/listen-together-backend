const crypto = require('crypto');

const generateId = (length = 16) => {
  return crypto.randomBytes(length).toString('hex');
};

const generateRoomCode = (length = 6) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const generateUserId = () => {
  return crypto.randomUUID();
};

const urlValidators = {
  youtube: (url) => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)/;
    return youtubeRegex.test(url);
  },

  spotify: (url) => {
    const spotifyRegex = /^(https?:\/\/)?(open\.)?spotify\.com\/(track|album|playlist)\/[a-zA-Z0-9]+/;
    return spotifyRegex.test(url);
  },

  isValidUrl: (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
};

const timeUtils = {
  formatDuration: (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  },

  parseTimeToSeconds: (timeString) => {
    const parts = timeString.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1]; 
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]; 
    }
    return 0;
  },

  getCurrentTimestamp: () => Date.now(),
  
  isExpired: (timestamp, expirationMs) => {
    return Date.now() - timestamp > expirationMs;
  }
};

const stringUtils = {
  sanitize: (str) => {
    return str.replace(/[<>]/g, '').trim();
  },

  truncate: (str, maxLength = 100) => {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  },

  slugify: (str) => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
};

const fileUtils = {
  getFileExtension: (filename) => {
    return filename.split('.').pop().toLowerCase();
  },

  isValidAudioFile: (filename) => {
    const validExtensions = ['mp3', 'mp4', 'm4a', 'wav', 'ogg'];
    const ext = fileUtils.getFileExtension(filename);
    return validExtensions.includes(ext);
  },

  formatFileSize: (bytes) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
};

const asyncUtils = {
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  timeout: (promise, ms) => {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Operation timed out')), ms)
      )
    ]);
  },

  retry: async (fn, maxAttempts = 3, delay = 1000) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxAttempts) throw error;
        await asyncUtils.delay(delay * attempt);
      }
    }
  }
};

const arrayUtils = {
  chunk: (array, size) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  },

  shuffle: (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  },

  unique: (array, key = null) => {
    if (key) {
      const seen = new Set();
      return array.filter(item => {
        const value = item[key];
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      });
    }
    return [...new Set(array)];
  }
};

module.exports = {
  generateId,
  generateRoomCode,
  generateUserId,
  urlValidators,
  timeUtils,
  stringUtils,
  fileUtils,
  asyncUtils,
  arrayUtils
};
