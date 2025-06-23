const express = require('express');
const db = require('../config/database');
const Joi = require('joi');
const router = express.Router();
const multiAuth = require('../middleware/multiAuth');

// Validation schemas
const createUserSchema = Joi.object({
  tenant_id: Joi.string().uuid().required(),
  external_auth_id: Joi.string().required(),
  email: Joi.string().email().required(),
  name: Joi.string().min(2).max(255),
  role: Joi.string().valid('admin', 'parent', 'child').required()
});

const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(255),
  role: Joi.string().valid('admin', 'parent', 'child')
});

// Apply multi-provider auth to all routes below
router.use(multiAuth);

// GET /api/users - Get all users
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM users
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      SELECT * FROM users
      WHERE id = $1 AND deleted_at IS NULL
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
});

// POST /api/users - Create new user
router.post('/', async (req, res) => {
  try {
    const { error, value } = createUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const result = await db.query(`
      INSERT INTO users (tenant_id, external_auth_id, email, name, role)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [value.tenant_id, value.external_auth_id, value.email, value.name, value.role]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ message: 'User already exists' });
    }
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = updateUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const result = await db.query(`
      UPDATE users
      SET name = $1, role = $2, updated_at = NOW()
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `, [value.name, value.role, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

// DELETE /api/users/:id - Soft delete user
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      UPDATE users
      SET deleted_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

router.get('/profile', (req, res) => {
  res.json({ user: req.user });
});

module.exports = router; 
