const jwt = require('jsonwebtoken');

function authenticateAccessToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ message: 'Access token missing' });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired access token' });
    }

    req.user = user; // e.g., { device_uid: 'xyz123' }
    next();
  });
}

module.exports = authenticateAccessToken;
