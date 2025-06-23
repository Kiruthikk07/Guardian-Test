const express = require('express');
const db = require('../config/database');
const firebaseAuth = require('../middleware/firebaseAuth');
const router = express.Router();

router.use(firebaseAuth);

// POST /api/parent
router.post('/', async (req, res) => {
  const { name, email, external_auth_id } = req.body;
  if (!name || !email || !external_auth_id) {
    return res.status(400).json({ message: 'name, email, and external_auth_id are required' });
  }

  try {
    // Check if user with this email already exists
    const userResult = await db.query(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email]
    );
    if (userResult.rows.length > 0) {
      return res.status(409).json({ message: 'User with this email already exists', user: userResult.rows[0] });
    }

    // Check if a tenant exists for this email (by domain or by user association)
    let tenant;
    const existingTenantResult = await db.query(
      `SELECT t.* FROM tenants t
       JOIN users u ON u.tenant_id = t.id
       WHERE u.email = $1 AND t.deleted_at IS NULL AND u.deleted_at IS NULL
       LIMIT 1`,
      [email]
    );
    if (existingTenantResult.rows.length > 0) {
      tenant = existingTenantResult.rows[0];
    } else {
      // Create a new tenant (use email as tenant name, or extract domain if you prefer)
      const tenantName = email;
      const tenantInsert = await db.query(
        'INSERT INTO tenants (name) VALUES ($1) RETURNING *',
        [tenantName]
      );
      tenant = tenantInsert.rows[0];
    }

    // Create the user and associate with tenant
    const userInsert = await db.query(
      `INSERT INTO users (tenant_id, name, email, external_auth_id, role)
       VALUES ($1, $2, $3, $4, 'parent') RETURNING *`,
      [tenant.id, name, email, external_auth_id]
    );
    const user = userInsert.rows[0];

    res.status(201).json({ success: true, tenant, user });
  } catch (error) {
    console.error('Provision error:', error);
    res.status(500).json({ message: 'Failed to provision user and tenant', error: error.message });
  }
});

module.exports = router; 
