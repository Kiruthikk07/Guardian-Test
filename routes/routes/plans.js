const express = require('express');
const db = require('../config/database');
const router = express.Router();
const multiAuth = require('../middleware/multiAuth');

// Apply multi-provider auth to all routes below
router.use(multiAuth);

// GET /api/plans - List all available plans
router.get('/', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT p.*, 
        COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) as active_subscribers
      FROM plans p
      LEFT JOIN tenants t ON p.id = t.plan_id
      WHERE p.active = true
      GROUP BY p.id
      ORDER BY p.price ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({ message: 'Failed to fetch plans' });
  }
});

// GET /api/plans/:id - Get plan by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      SELECT p.*, 
        COUNT(t.id) FILTER (WHERE t.deleted_at IS NULL) as active_subscribers
      FROM plans p
      LEFT JOIN tenants t ON p.id = t.plan_id
      WHERE p.id = $1 AND p.active = true
      GROUP BY p.id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Plan not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching plan:', error);
    res.status(500).json({ message: 'Failed to fetch plan' });
  }
});

// POST /api/plans - Create new plan (admin only)
router.post('/', async (req, res) => {
  try {
    const { name, description, price, billingCycle, features, maxDevices, maxUsers } = req.body;

    const result = await db.query(`
      INSERT INTO plans (name, description, price, billing_cycle, features, max_devices, max_users)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name, description, price, billingCycle, features || {}, maxDevices, maxUsers]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating plan:', error);
    res.status(500).json({ message: 'Failed to create plan' });
  }
});

// PUT /api/plans/:id - Update plan (admin only)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, billingCycle, features, maxDevices, maxUsers, active } = req.body;

    const result = await db.query(`
      UPDATE plans 
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          price = COALESCE($3, price),
          billing_cycle = COALESCE($4, billing_cycle),
          features = COALESCE($5, features),
          max_devices = COALESCE($6, max_devices),
          max_users = COALESCE($7, max_users),
          active = COALESCE($8, active),
          updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `, [name, description, price, billingCycle, features, maxDevices, maxUsers, active, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating plan:', error);
    res.status(500).json({ message: 'Failed to update plan' });
  }
});

// DELETE /api/plans/:id - Deactivate plan (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      UPDATE plans 
      SET active = false, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    res.json({ message: 'Plan deactivated successfully' });
  } catch (error) {
    console.error('Error deactivating plan:', error);
    res.status(500).json({ message: 'Failed to deactivate plan' });
  }
});

module.exports = router; 
