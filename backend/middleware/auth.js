import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export function requireAuth(req, res, next) {
  const token = req.cookies?.access_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id:     payload.id,
      email:  payload.email,
      name:   payload.name,
      role:   payload.role,
      rep_id: payload.rep_id ?? null,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Returns a SQL WHERE clause fragment to filter accounts by owner for sales_rep role
export function repOwnerFilter(req, alias = 'c') {
  if (req.user?.role === 'sales_rep' && req.user.rep_id) {
    return { clause: `${alias}.owner_id = $`, value: req.user.rep_id };
  }
  return { clause: null, value: null };
}
