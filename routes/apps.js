const express = require('express');
const db = require('../config/database');
const Joi = require('joi');
const router = express.Router();
const multiAuth = require('../middleware/multiAuth');

// Validation schemas
const createAppSchema = Joi.object({
  tenant_id: Joi.string().uuid().required(),
  device_id: Joi.string().uuid().required(),
  app_package: Joi.string().required(),
  app_name: Joi.string().min(2).max(255),
  app_version: Joi.string(),
  app_details: Joi.object()
});

const updateAppSchema = Joi.object({
  app_name: Joi.string().min(2).max(255),
  app_version: Joi.string(),
  app_details: Joi.object()
});

// Apply multi-provider auth to all routes below
router.use(multiAuth);

// GET /api/apps - Get all apps
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM installed_apps
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching apps:', error);
    res.status(500).json({ message: 'Failed to fetch apps' });
  }
});

// GET /api/apps/:id - Get app by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      SELECT * FROM installed_apps
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'App not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching app:', error);
    res.status(500).json({ message: 'Failed to fetch app' });
  }
});

// POST /api/apps - Create new app
router.post('/', async (req, res) => {
  try {
    const { error, value } = createAppSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const result = await db.query(`
      INSERT INTO installed_apps (tenant_id, device_id, app_package, app_name, app_version, app_details)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [value.tenant_id, value.device_id, value.app_package, value.app_name, value.app_version, value.app_details]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ message: 'App already exists' });
    }
    console.error('Error creating app:', error);
    res.status(500).json({ message: 'Failed to create app' });
  }
});

// PUT /api/apps/:id - Update app
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = updateAppSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const result = await db.query(`
      UPDATE installed_apps
      SET app_name = $1, app_version = $2, app_details = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [value.app_name, value.app_version, value.app_details, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'App not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating app:', error);
    res.status(500).json({ message: 'Failed to update app' });
  }
});

// DELETE /api/apps/:id - Delete app
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      DELETE FROM installed_apps
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'App not found' });
    }
    
    res.json({ message: 'App deleted successfully' });
  } catch (error) {
    console.error('Error deleting app:', error);
    res.status(500).json({ message: 'Failed to delete app' });
  }
});

module.exports = router; 
