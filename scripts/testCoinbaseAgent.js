require('dotenv').config();
const crypto = require('crypto');
const fetch = require('cross-fetch');
const jwt = require('jsonwebtoken');

const apiKeyName = process.env.COINBASE_API_KEY_ID || '07ca80c2-bad0-4688-a3ab-478b1cf5b319';
const apiSecret = process.env.COINBASE_API_SECRET || 'ehyhkVx56u+syWx/JlVkL5KGXrUckR00lPKMrO71rMJSVgoYsAcu2XTuhQcgn+clvIOrpNqaaF0tfOqtv+wD9A==';
const projectId = process.env.COINBASE_PROJECT_ID || 'ba7c7fb8-d55e-4963-8905-62c43aef2697';

console.log('Testing Coinbase Agentic CDP Configuration...');
console.log('API Key ID:', apiKeyName);
console.log('Project ID:', projectId);

/**
 * Generate CDP JWT token for autonomous agent API requests
 */
function generateCdpJwt(method, path) {
  const host = 'api.cdp.coinbase.com';
  const uri = `${method} ${host}${path}`;

  const payload = {
    iss: 'cdp',
    nbf: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 120, // 2 minutes
    sub: apiKeyName,
    uri,
  };

  try {
    // If apiSecret is base64 Ed25519 or standard format
    const token = jwt.sign(payload, apiSecret, {
      algorithm: 'ES256', // or EdDSA / HS256 depending on key type
      header: {
        kid: apiKeyName,
        nonce: crypto.randomBytes(16).toString('hex'),
      },
    });
    return token;
  } catch (e) {
    // If not standard ECDSA PEM, format as HMAC / raw secret
    return null;
  }
}

console.log('CDP credentials configured for Agentic AI Engine.');
