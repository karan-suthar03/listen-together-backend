const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config/config');

function createApp(io) {
  const app = express();

  app.use(cors({
    origin: config.cors.allowedOrigins,
    credentials: config.cors.credentials
  }));

  app.use(express.json());

  app.use((req, res, next) => {
    req.io = io;
    req.config = config;
    next();
  });

  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    
    if (config.logging.level === 'debug') {
      console.log('Body:', req.body);
      console.log('Query:', req.query);
      console.log('Params:', req.params);
    }
    
    next();
  });

  app.get('/health', (req, res) => {
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: require('./package.json').version
    });
  });

  app.get('/', (req, res) => {
    res.json({ 
      message: 'ListenTogether Server API',
      version: require('./package.json').version,
      endpoints: {
        rooms: '/api/rooms',
        queue: '/api/queue',
        music: '/api/music',
        participants: '/api/participants'
      }
    });
  });

  app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello from the backend!' });
  });

  app.use('/public', express.static(path.join(__dirname, 'public')));
  
  app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

  const roomRoutes = require('./routes/roomRoutes');
  const musicRoutes = require('./routes/musicRoutes');
  const participantRoutes = require('./routes/participantRoutes');
  const queueRoutes = require('./routes/queueRoutes');

  app.use('/api/rooms', roomRoutes);
  app.use('/api/music', musicRoutes);
  app.use('/api/participants', participantRoutes);
  app.use('/api/queue', queueRoutes);

  app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    
    const { handleError } = require('./middleware/response');
    handleError(res, error, 'Global error handler');
  });

  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      statusCode: 404,
      path: req.originalUrl
    });
  });

  return app;
}

module.exports = createApp;
