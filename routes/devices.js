const express = require('express');
const db = require('../config/database');
const Joi = require('joi');
const router = express.Router();
const multiAuth = require('../middleware/multiAuth');

// Validation schemas
const createDeviceSchema = Joi.object({
  tenant_id: Joi.string().uuid().required(),
  device_uid: Joi.string().required(),
  device_name: Joi.string().min(2).max(255),
  device_type: Joi.string().valid('android', 'ios', 'web').required(),
  owner_user_id: Joi.string().uuid(),
  child_id: Joi.string().uuid(),
  os: Joi.string(),
  os_version: Joi.string(),
  status: Joi.string().valid('active', 'inactive', 'blocked').default('active')
});

const updateDeviceSchema = Joi.object({
  device_name: Joi.string().min(2).max(255),
  device_type: Joi.string().valid('android', 'ios', 'web'),
  owner_user_id: Joi.string().uuid(),
  child_id: Joi.string().uuid(),
  os: Joi.string(),
  os_version: Joi.string(),
  status: Joi.string().valid('active', 'inactive', 'blocked')
});

const linkDeviceSchema = Joi.object({
  inviteCode: Joi.string().required(),
  deviceUid: Joi.string().required(),
  deviceName: Joi.string().min(2).max(255).required(),
  os: Joi.string().valid('Android', 'iOS', 'Windows', 'macOS').required(),
  osVersion: Joi.string().required()
});

const appSchema = Joi.object({
  appPackage: Joi.string().required(),
  appName: Joi.string().required(),
  version: Joi.string().required(),
  installedAt: Joi.date().iso().required()
});

const activeAppSchema = Joi.object({
  appPackage: Joi.string().required(),
  timestamp: Joi.date().iso().required()
});

const usageSchema = Joi.object({
  appPackage: Joi.string().required(),
  usageDate: Joi.date().iso().required(),
  secondsUsed: Joi.number().integer().min(0).required()
});

const systemMetricsSchema = Joi.object({
  timestamp: Joi.date().iso().required(),
  batteryLevel: Joi.number().integer().min(0).max(100).required(),
  uptime: Joi.number().integer().min(0).required(),
  memoryUsed: Joi.number().integer().min(0).required()
});

// Apply multi-provider auth to all routes below
router.use(multiAuth);

// GET /api/devices - Get all devices for tenant
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT d.*, 
        COUNT(a.id) as app_count,
        u.name as owner_name
      FROM devices d
      LEFT JOIN apps a ON d.id = a.device_id AND a.deleted_at IS NULL
      LEFT JOIN users u ON d.user_id = u.id
      WHERE d.tenant_id = $1 AND d.deleted_at IS NULL
      GROUP BY d.id, u.name
      ORDER BY d.created_at DESC
    `, [req.user.tenant_id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching devices:', error);
    res.status(500).json({ message: 'Failed to fetch devices' });
  }
});

// GET /api/devices/:id - Get device by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      SELECT d.*, u.name as owner_name
      FROM devices d
      LEFT JOIN users u ON d.user_id = u.id
      WHERE d.id = $1 AND d.tenant_id = $2 AND d.deleted_at IS NULL
    `, [id, req.user.tenant_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching device:', error);
    res.status(500).json({ message: 'Failed to fetch device' });
  }
});

// POST /api/devices - Create new device
router.post('/', async (req, res) => {
  try {
    const { error, value } = createDeviceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const result = await db.query(`
      INSERT INTO devices (tenant_id, device_uid, device_name, device_type, owner_user_id, child_id, os, os_version, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [value.tenant_id, value.device_uid, value.device_name, value.device_type, value.owner_user_id, value.child_id, value.os, value.os_version, value.status]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ message: 'Device already exists' });
    }
    console.error('Error creating device:', error);
    res.status(500).json({ message: 'Failed to create device' });
  }
});

// POST /api/devices/link - Link device using invite code
router.post('/link', async (req, res) => {
  try {
    const { error, value } = linkDeviceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Verify device invite
    const inviteResult = await db.query(`
      SELECT * FROM invites 
      WHERE invite_code = $1 AND invite_type = 'device' 
      AND expires_at > NOW() AND used_at IS NULL
    `, [value.inviteCode]);

    if (inviteResult.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired invite code' });
    }

    // Start transaction
    await db.query('BEGIN');

    // Create device
    const deviceResult = await db.query(`
      INSERT INTO devices (tenant_id, device_uid, name, os, os_version, status)
      VALUES ($1, $2, $3, $4, $5, 'active')
      RETURNING *
    `, [inviteResult.rows[0].tenant_id, value.deviceUid, value.deviceName, value.os, value.osVersion]);

    // Mark invite as used
    await db.query(`
      UPDATE invites SET used_at = NOW() WHERE id = $1
    `, [inviteResult.rows[0].id]);

    await db.query('COMMIT');

    res.status(201).json(deviceResult.rows[0]);
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error linking device:', error);
    res.status(500).json({ message: 'Failed to link device' });
  }
});

// PUT /api/devices/:id - Update device
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;

    const result = await db.query(`
      UPDATE devices 
      SET name = COALESCE($1, name), 
          status = COALESCE($2, status),
          updated_at = NOW()
      WHERE id = $3 AND tenant_id = $4 AND deleted_at IS NULL
      RETURNING *
    `, [name, status, id, req.user.tenant_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating device:', error);
    res.status(500).json({ message: 'Failed to update device' });
  }
});

// DELETE /api/devices/:id - Soft delete device
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      UPDATE devices 
      SET deleted_at = NOW()
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
      RETURNING *
    `, [id, req.user.tenant_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    res.json({ message: 'Device deleted successfully' });
  } catch (error) {
    console.error('Error deleting device:', error);
    res.status(500).json({ message: 'Failed to delete device' });
  }
});

// POST /api/devices/:id/apps - Upload installed apps
router.post('/:id/apps', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = Joi.array().items(appSchema).validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Verify device belongs to tenant
    const deviceResult = await db.query(`
      SELECT id FROM devices WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
    `, [id, req.user.tenant_id]);

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Start transaction
    await db.query('BEGIN');

    // Clear existing apps for this device
    await db.query(`
      UPDATE apps SET deleted_at = NOW() WHERE device_id = $1
    `, [id]);

    // Insert new apps
    for (const app of value) {
      await db.query(`
        INSERT INTO apps (device_id, app_package, app_name, version, installed_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, app.appPackage, app.appName, app.version, app.installedAt]);
    }

    await db.query('COMMIT');

    res.status(201).json({ message: `${value.length} apps uploaded successfully` });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error uploading apps:', error);
    res.status(500).json({ message: 'Failed to upload apps' });
  }
});

// GET /api/devices/:id/apps - Get installed apps
router.get('/:id/apps', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      SELECT a.* FROM apps a
      JOIN devices d ON a.device_id = d.id
      WHERE d.id = $1 AND d.tenant_id = $2 AND a.deleted_at IS NULL
      ORDER BY a.app_name
    `, [id, req.user.tenant_id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching apps:', error);
    res.status(500).json({ message: 'Failed to fetch apps' });
  }
});

// POST /api/devices/:id/active-app - Upload active app
router.post('/:id/active-app', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = activeAppSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Verify device belongs to tenant
    const deviceResult = await db.query(`
      SELECT id FROM devices WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
    `, [id, req.user.tenant_id]);

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }

    const result = await db.query(`
      INSERT INTO active_apps (device_id, app_package, timestamp)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id, value.appPackage, value.timestamp]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading active app:', error);
    res.status(500).json({ message: 'Failed to upload active app' });
  }
});

// GET /api/devices/:id/active-app - Get active app
router.get('/:id/active-app', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      SELECT aa.* FROM active_apps aa
      JOIN devices d ON aa.device_id = d.id
      WHERE d.id = $1 AND d.tenant_id = $2
      ORDER BY aa.timestamp DESC
      LIMIT 1
    `, [id, req.user.tenant_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No active app found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching active app:', error);
    res.status(500).json({ message: 'Failed to fetch active app' });
  }
});

// POST /api/devices/:id/usage - Upload daily usage
router.post('/:id/usage', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = Joi.array().items(usageSchema).validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Verify device belongs to tenant
    const deviceResult = await db.query(`
      SELECT id FROM devices WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
    `, [id, req.user.tenant_id]);

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Start transaction
    await db.query('BEGIN');

    // Insert usage data
    for (const usage of value) {
      await db.query(`
        INSERT INTO app_usage (device_id, app_package, usage_date, seconds_used)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (device_id, app_package, usage_date) 
        DO UPDATE SET seconds_used = EXCLUDED.seconds_used
      `, [id, usage.appPackage, usage.usageDate, usage.secondsUsed]);
    }

    await db.query('COMMIT');

    res.status(201).json({ message: `${value.length} usage records uploaded successfully` });
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error uploading usage:', error);
    res.status(500).json({ message: 'Failed to upload usage' });
  }
});

// GET /api/devices/:id/usage - Get daily usage
router.get('/:id/usage', async (req, res) => {
  try {
    const { id } = req.params;
    const { start, end } = req.query;

    let query = `
      SELECT au.* FROM app_usage au
      JOIN devices d ON au.device_id = d.id
      WHERE d.id = $1 AND d.tenant_id = $2
    `;
    const params = [id, req.user.tenant_id];

    if (start && end) {
      query += ` AND au.usage_date BETWEEN $3 AND $4`;
      params.push(start, end);
    }

    query += ` ORDER BY au.usage_date DESC, au.seconds_used DESC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json({ message: 'Failed to fetch usage' });
  }
});

// POST /api/devices/:id/system-metrics - Upload system metrics
router.post('/:id/system-metrics', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = systemMetricsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Verify device belongs to tenant
    const deviceResult = await db.query(`
      SELECT id FROM devices WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
    `, [id, req.user.tenant_id]);

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }

    const result = await db.query(`
      INSERT INTO system_metrics (device_id, timestamp, battery_level, uptime, memory_used)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id, value.timestamp, value.batteryLevel, value.uptime, value.memoryUsed]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading system metrics:', error);
    res.status(500).json({ message: 'Failed to upload system metrics' });
  }
});

// GET /api/devices/:id/system-metrics - Get system metrics
router.get('/:id/system-metrics', async (req, res) => {
  try {
    const { id } = req.params;
    const { recent = 10 } = req.query;

    const result = await db.query(`
      SELECT sm.* FROM system_metrics sm
      JOIN devices d ON sm.device_id = d.id
      WHERE d.id = $1 AND d.tenant_id = $2
      ORDER BY sm.timestamp DESC
      LIMIT $3
    `, [id, req.user.tenant_id, recent]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching system metrics:', error);
    res.status(500).json({ message: 'Failed to fetch system metrics' });
  }
});

module.exports = router; 
