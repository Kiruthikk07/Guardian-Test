const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const compression = require('compression');
const morgan = require('morgan');
const xss = require('xss-clean');
require('dotenv').config();

const db = require('./config/database');
const logger = require('./config/logger');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(15 * 60 / 60) // minutes
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Speed limiting
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 50, // allow 50 requests per 15 minutes, then...
  delayMs: (used, req) => {
    const delayAfter = req.slowDown.limit;
    return (used - delayAfter) * 500;
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "https://alcdn.msauth.net"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-type', 'x-request-id']
}));
app.use(compression());
app.use(morgan('combined', { stream: logger.stream }));
app.use(limiter);
app.use(speedLimiter);
app.use(xss()); // Prevent XSS attacks
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static('public'));

// Request ID middleware
app.use((req, res, next) => {
  req.id = Math.random().toString(36).substring(7);
  next();
});

// Routes
app.use('/api', routes);

// Simple startup check (no database required)
app.get('/', (req, res) => {
  res.json({ 
    message: 'Guard API is running',
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Health check
app.get('/health', async (req, res) => {
  try {
    // Try to connect to database
    const result = await db.query('SELECT NOW()');
    logger.info('Health check successful', { requestId: req.id });
    res.json({ 
      status: 'healthy', 
      database: 'connected',
      timestamp: result.rows[0].now,
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    logger.warn('Health check failed - database not available', { 
      requestId: req.id, 
      error: error.message
    });
    // Return partial health status when database is not available
    res.status(503).json({ 
      status: 'degraded', 
      database: 'disconnected',
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      message: 'Database connection not available'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    requestId: req.id,
    path: req.path,
    method: req.method,
    error: err.message,
    stack: err.stack,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.status(err.status || 500).json({ 
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    requestId: req.id
  });
});

// 404 handler
app.use('*', (req, res) => {
  logger.warn('Route not found', {
    requestId: req.id,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip
  });
  
  res.status(404).json({ 
    message: 'Route not found',
    requestId: req.id
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  app.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  app.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise: promise,
    reason: reason
  });
});

// Uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`, {
    port: PORT,
    nodeEnv: process.env.NODE_ENV || 'development',
    pid: process.pid
  });
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Database Admin: http://localhost:8080`);
}); 
