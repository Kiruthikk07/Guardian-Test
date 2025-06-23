const express = require('express');
const router = express.Router();

const userRoutes = require('./users');
const tenantRoutes = require('./tenants');
const deviceRoutes = require('./devices');
const appRoutes = require('./apps');
const notificationRoutes = require('./notifications');
const planRoutes = require('./plans');
const billingRoutes = require('./billing');

// Public routes
router.use('/users', userRoutes);
router.use('/tenants', tenantRoutes);
router.use('/devices', deviceRoutes);
router.use('/apps', appRoutes);
router.use('/notifications', notificationRoutes);
router.use('/plans', planRoutes);
router.use('/billing', billingRoutes);

module.exports = router; 
