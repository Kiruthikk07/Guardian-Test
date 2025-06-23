const express = require('express');
const db = require('../config/database');
const Joi = require('joi');
const router = express.Router();
const multiAuth = require('../middleware/multiAuth');

// Validation schemas
const createTenantSchema = Joi.object({
  familyName: Joi.string().min(2).max(255).required(),
  email: Joi.string().email().required(),
  externalAuthId: Joi.string().required(),
  name: Joi.string().min(2).max(255).required()
});

const updateTenantSchema = Joi.object({
  name: Joi.string().min(2).max(255)
});

const inviteSchema = Joi.object({
  inviteeEmail: Joi.string().email().when('inviteType', {
    is: 'parent',
    then: Joi.required(),
    otherwise: Joi.optional()
  }),
  inviteType: Joi.string().valid('parent', 'device').required()
});

const acceptInviteSchema = Joi.object({
  inviteCode: Joi.string().required(),
  email: Joi.string().email().required(),
  externalAuthId: Joi.string().required(),
  name: Joi.string().min(2).max(255).required()
});

const subscribeSchema = Joi.object({
  priceId: Joi.string().required(),
  paymentMethodId: Joi.string().required()
});

// Apply multi-provider auth to all routes below
router.use(multiAuth);

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

// POST /api/tenants - Create new tenant with first parent
router.post('/', async (req, res) => {
  try {
    const { error, value } = createTenantSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Start transaction
    await db.query('BEGIN');

    // Create tenant
    const tenantResult = await db.query(`
      INSERT INTO tenants (name) 
      VALUES ($1) 
      RETURNING *
    `, [value.familyName]);
    
    const tenant = tenantResult.rows[0];

    // Create first parent user
    const userResult = await db.query(`
      INSERT INTO users (tenant_id, name, email, external_auth_id, role) 
      VALUES ($1, $2, $3, $4, 'parent') 
      RETURNING *
    `, [tenant.id, value.name, value.email, value.externalAuthId]);

    await db.query('COMMIT');
    
    res.status(201).json({
      tenant: tenant,
      parent: userResult.rows[0]
    });
  } catch (error) {
    await db.query('ROLLBACK');
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ message: 'Tenant or user already exists' });
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

// POST /api/tenants/:id/invites - Create invite (parent or device)
router.post('/:id/invites', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = inviteSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Generate invite code
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const result = await db.query(`
      INSERT INTO invites (tenant_id, invite_code, invitee_email, invite_type, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id, inviteCode, value.inviteeEmail || null, value.inviteType, req.user.id]);

    res.status(201).json({
      ...result.rows[0],
      inviteCode: inviteCode
    });
  } catch (error) {
    console.error('Error creating invite:', error);
    res.status(500).json({ message: 'Failed to create invite' });
  }
});

// POST /api/tenants/:id/invites/accept - Accept parent invite
router.post('/:id/invites/accept', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = acceptInviteSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Verify invite
    const inviteResult = await db.query(`
      SELECT * FROM invites 
      WHERE tenant_id = $1 AND invite_code = $2 AND invite_type = 'parent' 
      AND expires_at > NOW() AND used_at IS NULL
    `, [id, value.inviteCode]);

    if (inviteResult.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired invite code' });
    }

    // Start transaction
    await db.query('BEGIN');

    // Create user
    const userResult = await db.query(`
      INSERT INTO users (tenant_id, name, email, external_auth_id, role)
      VALUES ($1, $2, $3, $4, 'parent')
      RETURNING *
    `, [id, value.name, value.email, value.externalAuthId]);

    // Mark invite as used
    await db.query(`
      UPDATE invites SET used_at = NOW() WHERE id = $1
    `, [inviteResult.rows[0].id]);

    await db.query('COMMIT');

    res.status(201).json(userResult.rows[0]);
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error accepting invite:', error);
    res.status(500).json({ message: 'Failed to accept invite' });
  }
});

// GET /api/tenants/:id/audit-logs - Get audit logs
router.get('/:id/audit-logs', async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const result = await db.query(`
      SELECT al.*, u.name as user_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.tenant_id = $1
      ORDER BY al.created_at DESC
      LIMIT $2 OFFSET $3
    `, [id, limit, offset]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
});

// POST /api/tenants/:id/subscribe - Subscribe tenant to plan
router.post('/:id/subscribe', async (req, res) => {
  try {
    const { id } = req.params;
    const { error, value } = subscribeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Here you would integrate with Stripe
    // For now, we'll just update the tenant subscription status
    const result = await db.query(`
      UPDATE tenants 
      SET subscription_status = 'active', 
          stripe_price_id = $1,
          stripe_payment_method_id = $2,
          updated_at = NOW()
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `, [value.priceId, value.paymentMethodId, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error subscribing tenant:', error);
    res.status(500).json({ message: 'Failed to subscribe tenant' });
  }
});

module.exports = router; 
