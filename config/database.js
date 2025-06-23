require('dotenv').config();
const logger = require('./logger');

const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  max: process.env.DB_MAX ? Number(process.env.DB_MAX) : 20, // Maximum number of clients
  min: process.env.DB_MIN ? Number(process.env.DB_MIN) : 4,  // Minimum number of clients
  idle: process.env.DB_IDLE ? Number(process.env.DB_IDLE) : 10000, // Close idle clients after 10 seconds
  connectionTimeoutMillis: process.env.DB_CONNECTION_TIMEOUT ? Number(process.env.DB_CONNECTION_TIMEOUT) : 2000, // Return an error after 2 seconds
  idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT ? Number(process.env.DB_IDLE_TIMEOUT) : 30000, // Close idle clients after 30 seconds
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: false,
    sslmode: 'require'
  } : false,
  // Additional security settings
  application_name: 'guard-api',
  statement_timeout: 30000, // 30 seconds
  query_timeout: 30000, // 30 seconds
});

pool.on('connect', (client) => {
  logger.info('📊 Connected to PostgreSQL database', {
    user: client.user,
    database: client.database,
    host: client.host,
    port: client.port
  });
});

pool.on('error', (err, client) => {
  logger.error('❌ Database connection error:', {
    error: err.message,
    stack: err.stack,
    client: client ? 'active' : 'inactive'
  });
});

pool.on('acquire', (client) => {
  logger.debug('🔗 Client acquired from pool');
});

pool.on('release', (client) => {
  logger.debug('🔓 Client released back to pool');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🛑 Shutting down database pool...');
  await pool.end();
  process.exit(0);
});

module.exports = pool; 
