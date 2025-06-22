const express = require('express');
const db = require('../config/database');
const Joi = require('joi');
const router = express.Router();

// Validation schemas
const createTenantSchema = Joi.object({
  name: Joi.string().min(2).max(255).required()
});

const updateTenantSchema = Joi.object({
  name: Joi.string().min(2).max(255)
});

// GET /api/tenants - Get all tenants
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT t.*, 
        COUNT(u.id) FILTER (WHERE u.deleted_at IS NULL) as user_count,
        COUNT(d.id) FILTER (WHERE d.deleted_at IS NULL) as device_count
      FROM tenants t
      LEFT JOIN users u ON t.id = u.tenant_id
      LEFT JOIN devices d ON t.id = d.tenant_id
      WHERE t.deleted_at IS NULL
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ message: 'Failed to fetch tenants' });
  }
});

// GET /api/tenants/:id - Get tenant by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      SELECT t.*, 
        COUNT(u.id) FILTER (WHERE u.deleted_at IS NULL) as user_count,
        COUNT(d.id) FILTER (WHERE d.deleted_at IS NULL) as device_count
      FROM tenants t
      LEFT JOIN users u ON t.id = u.tenant_id
      LEFT JOIN devices d ON t.id = d.tenant_id
      WHERE t.id = $1 AND t.deleted_at IS NULL
      GROUP BY t.id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching tenant:', error);
    res.status(500).json({ message: 'Failed to fetch tenant' });
  }
});

// POST /api/tenants - Create new tenant
router.post('/', async (req, res) => {
  try {
    const { error, value } = createTenantSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const result = await db.query(`
      INSERT INTO tenants (name) 
      VALUES ($1) 
      RETURNING *
    `, [value.name]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ message: 'Tenant name already exists' });
    }
    console.error('Error creating tenant:', error);
    res.status(500).json({ message: 'Failed to create tenant' });
  }
});

// PUT /api/tenants/:id - Update tenant
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = updateTenantSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const result = await db.query(`
      UPDATE tenants 
      SET name = $1, updated_at = NOW()
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING *
    `, [value.name, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ message: 'Tenant name already exists' });
    }
    console.error('Error updating tenant:', error);
    res.status(500).json({ message: 'Failed to update tenant' });
  }
});

// DELETE /api/tenants/:id - Soft delete tenant
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      UPDATE tenants 
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }
    
    res.json({ message: 'Tenant deleted successfully' });
  } catch (error) {
    console.error('Error deleting tenant:', error);
    res.status(500).json({ message: 'Failed to delete tenant' });
  }
});

module.exports = router; 