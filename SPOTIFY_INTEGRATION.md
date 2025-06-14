# Spotify Integration

This document describes the Spotify integration added to the ListenTogether application.

## Overview

The application now supports adding tracks from Spotify URLs in addition to YouTube URLs. When a Spotify URL is provided, the system:

1. Fetches track metadata from Spotify (title, artist, album, duration, artwork)
2. Searches YouTube for a matching audio version of the track
3. Downloads the audio from YouTube using the existing infrastructure
4. Plays the track with Spotify metadata displayed

## Supported URL Formats

### YouTube URLs (existing)
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://youtube.com/embed/VIDEO_ID`

### Spotify URLs (new)
- `https://open.spotify.com/track/TRACK_ID`
- `https://spotify.com/track/TRACK_ID`

## How It Works

### Backend Components

1. **SpotifyService** (`services/spotifyService.js`)
   - Fetches track metadata from Spotify using `spotify-url-info`
   - Searches YouTube for matching tracks using `yt-search`
   - Returns combined metadata with YouTube source for downloading

2. **Updated QueueRoutes** (`routes/queueRoutes.js`)
   - Detects URL type (YouTube vs Spotify)
   - Routes to appropriate service
   - Handles both URL types in the same endpoint

### Frontend Components

1. **Enhanced Room Details** (`room-details.component.ts`)
   - URL detection for both YouTube and Spotify
   - Dynamic placeholder text and processing messages
   - Enhanced error handling with source-specific feedback

2. **Updated Queue Display** (`music-queue.component.html`)
   - Shows source indicator (YouTube 📺 or Spotify 📻)
   - Displays original Spotify metadata when available
   - Enhanced track information display

## Queue Item Properties

Queue items now include additional properties for Spotify tracks:

```typescript
interface QueueItem {
  // Existing properties...
  spotifyUrl?: string;        // Original Spotify URL
  spotifyTitle?: string;      // Original Spotify title
  spotifyArtist?: string;     // Original Spotify artist
  source?: 'youtube' | 'spotify' | 'direct';  // Source type
  // ... other properties
}
```

## User Experience

1. **Adding Tracks**: Users can paste either YouTube or Spotify URLs in the same input field
2. **Processing Feedback**: Different messages show for "Processing YouTube video..." vs "Processing Spotify track..."
3. **Queue Display**: Each track shows its source (YouTube/Spotify) with appropriate icons
4. **Error Handling**: Source-specific error messages help users understand issues

## Dependencies Added

### Backend
- `spotify-url-info@^3.2.13` - Fetches Spotify track metadata
- `node-fetch@^2.6.7` - HTTP client for API requests
- `yt-search@^2.10.4` - Searches YouTube for tracks

## Example Flow

1. User pastes: `https://open.spotify.com/track/32YA3PItSKjcNONrp1p4Y5`
2. System fetches Spotify metadata: "Song Title" by "Artist Name"
3. System searches YouTube for: "Song Title Artist Name"
4. System finds best YouTube match and downloads audio
5. Track appears in queue showing:
   - Title: "Song Title" (from Spotify)
   - Artist: "Artist Name" (from Spotify) 
   - Source: 📻 Spotify
   - Thumbnail: Spotify artwork or YouTube thumbnail

## Error Handling

- Invalid Spotify URLs return specific error messages
- YouTube search failures provide fallback options
- Download failures are handled the same as YouTube failures
- Network issues are gracefully handled with user feedback

## Future Enhancements

Potential improvements could include:
- Support for Spotify playlists and albums
- Multiple YouTube search results for better matching
- Preference system for audio quality vs accuracy
- Caching of Spotify metadata for repeated tracks
