// Load environment variables from .env file
require('dotenv').config();

const config = {
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || 'localhost'
    }, supabase: {
        url: process.env.SUPABASE_URL,
        // Server-side operations MUST use service role key for full permissions
        // The service role key bypasses RLS and has admin privileges
        key: process.env.SUPABASE_SERVICE_ROLE_KEY, // Only use service role for server
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        // Anon key kept for documentation/reference only - not used server-side
        anonKey: process.env.SUPABASE_ANON_KEY, // For client-side use only
        bucket: process.env.SUPABASE_BUCKET_NAME || 'music-files',
        publicUrl: process.env.SUPABASE_PUBLIC_URL || process.env.SUPABASE_URL
    },
    cors: {
        allowedOrigins: process.env.ALLOWED_ORIGINS ?
            process.env.ALLOWED_ORIGINS.split(',') :
            ['http://localhost:4200', 'http://localhost:4201', 'https://subscriptions-distances-ie-infectious.trycloudflare.com'],
        credentials: true
    },
    room: {
        codeLength: 6,
        maxParticipants: process.env.MAX_PARTICIPANTS || 20,
        inactivityTimeout: process.env.INACTIVITY_TIMEOUT || 1000 * 60 * 60 * 2
    },
    downloads: {
        directory: './downloads',
        maxFileSize: process.env.MAX_FILE_SIZE || 100 * 1024 * 1024,
        allowedFormats: ['mp3', 'mp4', 'm4a'],
        cleanupInterval: process.env.CLEANUP_INTERVAL || 1000 * 60 * 60 * 24
    },
    youtube: {
        maxDuration: process.env.MAX_YOUTUBE_DURATION || 600,
        quality: process.env.YOUTUBE_QUALITY || 'highestaudio'
    }, spotify: {
        maxPlaylistTracks: process.env.MAX_PLAYLIST_TRACKS || 10
    },
    queue: {
        maxSongs: process.env.MAX_QUEUE_SONGS || 10
    },
    validation: {
        roomCode: {
            minLength: 6,
            maxLength: 6,
            pattern: /^[A-Z0-9]{6}$/
        },
        username: {
            minLength: 1,
            maxLength: 50
        }
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'combined'
    }
};

module.exports = config;
