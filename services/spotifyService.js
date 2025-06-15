const { getData } = require('spotify-url-info')(require('node-fetch'));
const ytSearch = require('yt-search');
const { EventEmitter } = require('events');

class SpotifyService extends EventEmitter {
  constructor() {
    super();
  }
  isSpotifyUrl(url) {
    return url.includes('open.spotify.com') || url.includes('spotify.com');
  }

  isSpotifyPlaylist(url) {
    return url.includes('/playlist/');
  }

  isSpotifyTrack(url) {
    return url.includes('/track/');
  }

  async processSpotifyUrl(spotifyUrl) {
    try {
      console.log('Processing Spotify URL:', spotifyUrl);
      
      const info = await getData(spotifyUrl);
      
      if (!info) {
        throw new Error('Could not fetch information from Spotify URL');
      }

      if (info.type === 'playlist' && Array.isArray(info.trackList)) {
        return await this.processSpotifyPlaylist(info, spotifyUrl);
      } else if (info.type === 'track') {
        return await this.processSpotifyTrack(info, spotifyUrl);
      } else {
        throw new Error(`Unsupported Spotify URL type: ${info.type}`);
      }
      
    } catch (error) {
      console.error('Error processing Spotify URL:', error);
      throw new Error(`Failed to process Spotify URL: ${error.message}`);
    }
  }
  async processSpotifyPlaylist(playlistInfo, spotifyUrl) {
    console.log(`Processing playlist: ${playlistInfo.name} with ${playlistInfo.trackList.length} tracks`);
    
    // Return basic playlist info immediately and process tracks as a stream
    return {
      type: 'playlist',
      name: playlistInfo.name,
      description: playlistInfo.description || '',
      thumbnail: playlistInfo.images && playlistInfo.images[0] ? playlistInfo.images[0].url : '',
      trackCount: playlistInfo.trackList.length,
      originalTrackCount: playlistInfo.trackList.length,
      tracks: playlistInfo.trackList, // Return raw track list for streaming processing
      spotifyUrl: spotifyUrl
    };
  }
  async processSpotifyTrackFromPlaylist(track, playlistName, spotifyUrl, trackIndex) {
    try {
      console.log('🎵 processSpotifyTrackFromPlaylist called with:', { 
        trackTitle: track.title || track.name, 
        playlistName, 
        trackIndex 
      });
      
      const trackName = track.title || track.name;
      const artist = track.subtitle || (track.artists && track.artists[0] ? track.artists[0].name : '');
      
      console.log('🎵 Track details:', { trackName, artist });
        if (!trackName) {
        throw new Error('No title found for track');
      }

      // Create enhanced search query with artist information
      let searchQuery = trackName.trim();
      if (artist && artist.trim()) {
        searchQuery = `${trackName} ${artist}`.trim();
      }
      
      console.log('🎵 YouTube search query (enhanced):', searchQuery);
      
      const ytResult = await ytSearch(searchQuery);
      console.log('🎵 YouTube search result:', ytResult ? 'Found results' : 'No results', ytResult?.videos?.length || 0, 'videos');
      
      if (!ytResult || !ytResult.videos || ytResult.videos.length === 0) {
        // Fallback: try with just title if artist+title search failed
        if (artist && artist.trim()) {
          console.log('🎵 No results with artist, trying title only...');
          const fallbackQuery = trackName.trim();
          const fallbackResult = await ytSearch(fallbackQuery);
          
          if (!fallbackResult || !fallbackResult.videos || fallbackResult.videos.length === 0) {
            throw new Error(`No YouTube results for: ${searchQuery} or ${fallbackQuery}`);
          }
          
          console.log('🎵 Fallback search successful with title only');
          const bestMatch = fallbackResult.videos[0];
          console.log('🎵 Best match (fallback):', { title: bestMatch.title, url: bestMatch.url });
          
          return await this._createTrackResult(bestMatch, trackName, artist, playlistName, spotifyUrl, trackIndex, fallbackQuery);
        }
          throw new Error(`No YouTube results for: ${searchQuery}`);
      }

      // Use the first (best) result from the enhanced search
      const bestMatch = ytResult.videos[0];
      console.log('🎵 Best match (first result):', { title: bestMatch.title, url: bestMatch.url, channel: bestMatch.author?.name });

      const videoId = this.extractVideoId(bestMatch.url);
      console.log('🎵 Extracted video ID:', videoId);
      
      if (!videoId) {
        throw new Error(`Could not extract video ID for: ${searchQuery}`);
      }      return await this._createTrackResult(bestMatch, trackName, artist, playlistName, spotifyUrl, trackIndex, searchQuery);
      
    } catch (error) {
      console.error(`🎵 processSpotifyTrackFromPlaylist error:`, error.message);
      throw error;
    }
  }
  async processSpotifyTrack(trackInfo, spotifyUrl) {
    const trackName = trackInfo.name;
    const artist = trackInfo.artists && trackInfo.artists[0] ? trackInfo.artists[0].name : '';
    const album = trackInfo.album ? trackInfo.album.name : '';
    const duration = trackInfo.duration_ms ? Math.floor(trackInfo.duration_ms / 1000) : 0;
    const spotifyThumbnail = trackInfo.images && trackInfo.images[0] ? trackInfo.images[0].url : '';
    
    // Create enhanced search query with artist information
    let searchQuery = trackName.trim();
    if (artist && artist.trim()) {
      searchQuery = `${trackName} ${artist}`.trim();
    }
    
    console.log('Searching YouTube for (enhanced):', searchQuery);
    
    const ytResult = await ytSearch(searchQuery);
    
    if (!ytResult || !ytResult.videos || ytResult.videos.length === 0) {
      // Fallback: try with just title if artist+title search failed
      if (artist && artist.trim()) {
        console.log('🎵 No results with artist, trying title only...');
        const fallbackQuery = trackName.trim();
        const fallbackResult = await ytSearch(fallbackQuery);
        
        if (!fallbackResult || !fallbackResult.videos || fallbackResult.videos.length === 0) {
          throw new Error(`No YouTube results for: ${searchQuery} or ${fallbackQuery}`);
        }
          console.log('🎵 Fallback search successful with title only');
        const bestMatch = fallbackResult.videos[0];
        const videoId = this.extractVideoId(bestMatch.url);
        
        if (!videoId) {
          throw new Error('Could not extract video ID from YouTube URL');
        }

        return {
          type: 'track',
          spotifyTitle: trackName,
          spotifyArtist: artist,
          spotifyAlbum: album,
          spotifyDuration: duration,
          spotifyThumbnail: spotifyThumbnail,
          spotifyUrl: spotifyUrl,
          
          title: bestMatch.title,
          artist: bestMatch.author ? bestMatch.author.name : artist,
          duration: bestMatch.duration ? this.parseDuration(bestMatch.duration.timestamp) : duration,
          thumbnail: bestMatch.thumbnail || spotifyThumbnail,
          videoId: videoId,
          youtubeUrl: bestMatch.url,
          
          searchQuery: fallbackQuery,
          source: 'spotify',
          isPlaylistTrack: false
        };
      }
        throw new Error('No YouTube results found for this track');
    }

    // Use the first (best) result from the enhanced search
    const bestMatch = ytResult.videos[0];
    
    const videoId = this.extractVideoId(bestMatch.url);
    
    if (!videoId) {
      throw new Error('Could not extract video ID from YouTube URL');
    }

    console.log('Found YouTube match (first result):', bestMatch.title, 'URL:', bestMatch.url);

    return {
      type: 'track',
      spotifyTitle: trackName,
      spotifyArtist: artist,
      spotifyAlbum: album,
      spotifyDuration: duration,
      spotifyThumbnail: spotifyThumbnail,
      spotifyUrl: spotifyUrl,
      
      title: bestMatch.title,
      artist: bestMatch.author ? bestMatch.author.name : artist,
      duration: bestMatch.duration ? this.parseDuration(bestMatch.duration.timestamp) : duration,
      thumbnail: bestMatch.thumbnail || spotifyThumbnail,
      videoId: videoId,
      youtubeUrl: bestMatch.url,
      
      searchQuery: searchQuery,      source: 'spotify',
      isPlaylistTrack: false
    };
  }

  // Helper method to create track result object
  async _createTrackResult(bestMatch, trackName, artist, playlistName, spotifyUrl, trackIndex, searchQuery) {
    const videoId = this.extractVideoId(bestMatch.url);
    
    if (!videoId) {
      throw new Error(`Could not extract video ID from: ${bestMatch.url}`);
    }

    const result = {
      spotifyTitle: trackName,
      spotifyArtist: artist,
      spotifyPlaylist: playlistName,
      spotifyUrl: spotifyUrl,
      spotifyTrackIndex: trackIndex,
      
      title: bestMatch.title,
      artist: bestMatch.author ? bestMatch.author.name : artist,
      duration: bestMatch.duration ? this.parseDuration(bestMatch.duration.timestamp) : 0,
      thumbnail: bestMatch.thumbnail || '',
      videoId: videoId,
      youtubeUrl: bestMatch.url,
      
      searchQuery: searchQuery,
      source: 'spotify',
      isPlaylistTrack: true
    };
    
    console.log('🎵 processSpotifyTrackFromPlaylist success:', { 
      title: result.title, 
      videoId: result.videoId 
    });
      return result;
  }

  extractVideoId(url) {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  parseDuration(timestamp) {
    if (!timestamp) return 0;
    
    const parts = timestamp.split(':').reverse();
    let seconds = 0;
    
    for (let i = 0; i < parts.length; i++) {
      seconds += parseInt(parts[i]) * Math.pow(60, i);
    }
    
    return seconds;
  }

  async getYouTubeSearchResults(searchQuery, limit = 5) {
    try {
      const ytResult = await ytSearch(searchQuery);
      
      if (!ytResult || !ytResult.videos || ytResult.videos.length === 0) {
        return [];
      }

      return ytResult.videos.slice(0, limit).map(video => ({
        title: video.title,
        artist: video.author ? video.author.name : '',
        duration: video.duration ? this.parseDuration(video.duration.timestamp) : 0,
        thumbnail: video.thumbnail,
        videoId: this.extractVideoId(video.url),
        youtubeUrl: video.url,
        views: video.views
      }));
      
    } catch (error) {
      console.error('Error searching YouTube:', error);
      return [];
    }
  }
}

module.exports = new SpotifyService();
