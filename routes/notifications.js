const express = require('express');
const db = require('../config/database');
const router = express.Router();
const multiAuth = require('../middleware/multiAuth');

// Apply multi-provider auth to all routes below
router.use(multiAuth);

// GET /api/users/:userId/notifications - Get user notifications
router.get('/users/:userId/notifications', async (req, res) => {
  try {
    const { userId } = req.params;
    const { unreadOnly = false } = req.query;

    // Verify user belongs to same tenant
    const userResult = await db.query(`
      SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
    `, [userId, req.user.tenant_id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    let query = `
      SELECT n.*, nt.name as notification_type_name
      FROM notifications n
      JOIN notification_types nt ON n.notification_type = nt.type
      WHERE n.user_id = $1
    `;
    const params = [userId];

    if (unreadOnly === 'true') {
      query += ` AND n.read_at IS NULL`;
    }

    query += ` ORDER BY n.created_at DESC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// PATCH /api/notifications/:id/read - Mark notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      UPDATE notifications n
      SET read_at = NOW()
      FROM users u
      WHERE n.id = $1 AND n.user_id = u.id AND u.tenant_id = $2
      RETURNING n.*
    `, [id, req.user.tenant_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

// POST /api/notifications - Create notification (admin only)
router.post('/', async (req, res) => {
  try {
    const { userId, notificationType, title, message, data } = req.body;

    // Verify user belongs to same tenant
    const userResult = await db.query(`
      SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
    `, [userId, req.user.tenant_id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const result = await db.query(`
      INSERT INTO notifications (user_id, notification_type, title, message, data)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [userId, notificationType, title, message, data || {}]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ message: 'Failed to create notification' });
  }
});

module.exports = router; 
