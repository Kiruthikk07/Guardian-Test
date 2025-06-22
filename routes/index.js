const express = require('express');
const router = express.Router();

const tenantRoutes = require('./tenants');
const userRoutes = require('./users');
const deviceRoutes = require('./devices');
const appRoutes = require('./apps');

router.use('/tenants', tenantRoutes);
router.use('/users', userRoutes);
router.use('/devices', deviceRoutes);
router.use('/apps', appRoutes);

module.exports = router;