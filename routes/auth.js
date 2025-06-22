const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Mock user database or replace with DB query
const mockUser = {
  id: 1,
  email: 'parent@example.com',
  password: 'parent123', // In production, use hashed password
  role: 'parent'
};

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  // Replace this with real DB user lookup
  if (email !== mockUser.email || password !== mockUser.password) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const payload = {
    id: mockUser.id,
    email: mockUser.email,
    role: mockUser.role
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });

  res.json({ token });
});

module.exports = router;
