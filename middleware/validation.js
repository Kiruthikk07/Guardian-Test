const { body, param, query, validationResult } = require('express-validator');
const logger = require('../config/logger');

// Validation result handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Validation failed', {
      path: req.path,
      method: req.method,
      errors: errors.array(),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

// User validation rules
const validateUser = [
  body('tenant_id')
    .isUUID()
    .withMessage('Tenant ID must be a valid UUID'),
  body('external_auth_id')
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('External auth ID must be between 1 and 255 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Must be a valid email address'),
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 255 })
    .escape()
    .withMessage('Name must be between 2 and 255 characters'),
  body('role')
    .isIn(['admin', 'parent', 'child'])
    .withMessage('Role must be admin, parent, or child'),
  handleValidationErrors
];

// User update validation
const validateUserUpdate = [
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 255 })
    .escape()
    .withMessage('Name must be between 2 and 255 characters'),
  body('role')
    .optional()
    .isIn(['admin', 'parent', 'child'])
    .withMessage('Role must be admin, parent, or child'),
  handleValidationErrors
];

// UUID parameter validation
const validateUUID = [
  param('id')
    .isUUID()
    .withMessage('ID must be a valid UUID'),
  handleValidationErrors
];

// Pagination validation
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  handleValidationErrors
];

// Search validation
const validateSearch = [
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .escape()
    .withMessage('Search term must be between 1 and 100 characters'),
  handleValidationErrors
];

// Tenant validation
const validateTenant = [
  body('name')
    .isString()
    .trim()
    .isLength({ min: 2, max: 255 })
    .escape()
    .withMessage('Tenant name must be between 2 and 255 characters'),
  body('domain')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .isURL()
    .withMessage('Domain must be a valid URL'),
  handleValidationErrors
];

// Device validation
const validateDevice = [
  body('tenant_id')
    .isUUID()
    .withMessage('Tenant ID must be a valid UUID'),
  body('name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .escape()
    .withMessage('Device name must be between 1 and 255 characters'),
  body('type')
    .isIn(['mobile', 'tablet', 'desktop', 'laptop'])
    .withMessage('Device type must be mobile, tablet, desktop, or laptop'),
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'blocked'])
    .withMessage('Status must be active, inactive, or blocked'),
  handleValidationErrors
];

// App validation
const validateApp = [
  body('tenant_id')
    .isUUID()
    .withMessage('Tenant ID must be a valid UUID'),
  body('name')
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .escape()
    .withMessage('App name must be between 1 and 255 characters'),
  body('package_name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('Package name must be between 1 and 255 characters'),
  body('version')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Version must be between 1 and 50 characters'),
  handleValidationErrors
];

module.exports = {
  validateUser,
  validateUserUpdate,
  validateUUID,
  validatePagination,
  validateSearch,
  validateTenant,
  validateDevice,
  validateApp,
  handleValidationErrors
}; 
