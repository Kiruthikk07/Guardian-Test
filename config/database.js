require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  max: process.env.DB_MAX ? Number(process.env.DB_MAX) : undefined,
  min: process.env.DB_MIN ? Number(process.env.DB_MIN) : undefined,
  idle: process.env.DB_IDLE ? Number(process.env.DB_IDLE) : undefined,
  acquire: process.env.DB_ACQUIRE ? Number(process.env.DB_ACQUIRE) : undefined,
  evict: process.env.DB_EVICT ? Number(process.env.DB_EVICT) : undefined,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
  console.log('📊 Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

module.exports = pool; 