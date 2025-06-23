const admin = require('../config/firebase');
const axios = require('axios');

const users = {
  firebase: new Map(),
  microsoft: new Map()
};

const authenticateFirebase = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: 'parent',
      authProvider: 'firebase'
    };

    if (!users.firebase.has(decodedToken.uid)) {
      users.firebase.set(decodedToken.uid, {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || 'Parent User',
        role: 'parent',
        createdAt: new Date()
      });
    }
    next();
  } catch (error) {
    console.error('Firebase auth error:', error);
    res.status(401).json({ error: 'Invalid Firebase token' });
  }
};

const authenticateMicrosoft = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // First, validate the token format
    if (!token || token.split('.').length !== 3) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    // Verify Microsoft token by calling Microsoft Graph API
    const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    if (response.status !== 200) {
      return res.status(401).json({ error: 'Invalid Microsoft token' });
    }

    const userInfo = response.data;
    
    // Determine role based on job title or other criteria
    let role = 'employee';
    if (userInfo.jobTitle?.toLowerCase().includes('admin') || 
        userInfo.jobTitle?.toLowerCase().includes('manager') ||
        userInfo.jobTitle?.toLowerCase().includes('director')) {
      role = 'admin';
    }

    req.user = {
      id: userInfo.id,
      email: userInfo.mail || userInfo.userPrincipalName,
      name: userInfo.displayName,
      role: role,
      authProvider: 'microsoft',
      jobTitle: userInfo.jobTitle,
      department: userInfo.department
    };

    // Store user info if not exists
    if (!users.microsoft.has(userInfo.id)) {
      users.microsoft.set(userInfo.id, {
        id: userInfo.id,
        email: userInfo.mail || userInfo.userPrincipalName,
        name: userInfo.displayName,
        jobTitle: userInfo.jobTitle,
        department: userInfo.department,
        role: role,
        createdAt: new Date()
      });
    }

    console.log(`Microsoft auth successful for user: ${userInfo.displayName} (${userInfo.mail})`);
    next();
  } catch (error) {
    console.error('Microsoft auth error:', error);
    
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Microsoft Graph API Error:', error.response.status, error.response.data);
      
      if (error.response.status === 401) {
        return res.status(401).json({ error: 'Invalid Microsoft token - Unauthorized' });
      } else if (error.response.status === 403) {
        return res.status(401).json({ error: 'Microsoft token lacks required permissions' });
      } else {
        return res.status(401).json({ error: `Microsoft token validation failed: ${error.response.status}` });
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('Microsoft Graph API Request Error:', error.request);
      return res.status(401).json({ error: 'Microsoft token validation failed - No response from Microsoft Graph' });
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Microsoft auth setup error:', error.message);
      return res.status(401).json({ error: 'Microsoft token validation failed - Request setup error' });
    }
  }
};

const multiAuth = (req, res, next) => {
  const userType = req.headers['x-user-type'] || 'parent';
  
  if (userType === 'parent') {
    return authenticateFirebase(req, res, next);
  } else if (userType === 'admin' || userType === 'employee') {
    return authenticateMicrosoft(req, res, next);
  } else {
    return res.status(400).json({ error: 'Invalid user type. Use: parent, admin, or employee' });
  }
};

module.exports = multiAuth; 
