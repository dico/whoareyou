import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { db } from './db.js';
import { errorHandler } from './utils/errors.js';
import { authenticate } from './middleware/auth.js';
import { tenantScope } from './middleware/tenant.js';
import authRoutes from './routes/auth.js';
import contactRoutes from './routes/contacts.js';
import postRoutes from './routes/posts.js';
import addressRoutes from './routes/addresses.js';
import relationshipRoutes from './routes/relationships.js';
import labelRoutes from './routes/labels.js';
import companyRoutes from './routes/companies.js';
import lifeEventRoutes from './routes/life-events.js';
import reminderRoutes from './routes/reminders.js';
import notificationRoutes from './routes/notifications.js';
import uploadRoutes from './routes/uploads.js';
import systemRoutes from './routes/system.js';
import giftRoutes from './routes/gifts.js';
import importRoutes from './routes/import.js';
import exportRoutes from './routes/export.js';
import portalRoutes from './routes/portal.js';
import portalAdminRoutes from './routes/portal-admin.js';

const app = express();

// Trust Nginx proxy (needed for rate limiting and X-Forwarded-For)
app.set('trust proxy', 1);

// Security
app.use(helmet());
app.use(cors({
  origin: config.cors.origin === '*' ? true : config.cors.origin,
  credentials: true,
}));

// Body parsing
app.use(express.json());

// Rate limiting on login/register only (strict)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts, try again later' },
  validate: { xForwardedForHeader: false },
});

// Rate limiting on all API endpoints (generous — gallery browsing can be intensive)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many requests, try again later' },
  validate: { xForwardedForHeader: false },
});

// Stricter rate limiting for portal (guests)
const portalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, try again later' },
  validate: { xForwardedForHeader: false },
});

// Health check (no auth)
app.get('/api/health', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({
      status: 'ok',
      version: '0.1.0',
      environment: config.env,
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      message: 'Database connection failed',
    });
  }
});

// API info (no auth)
app.get('/api', (req, res) => {
  res.json({
    name: 'WhoareYou API',
    version: '0.1.0',
  });
});

// Auth routes — login/register have strict rate limit, rest uses general API limit
app.post('/api/auth/login', loginLimiter);
app.post('/api/auth/register', loginLimiter);
app.post('/api/auth/2fa/verify', loginLimiter);
app.post('/api/auth/passkey/login', loginLimiter);
app.post('/api/auth/forgot-password', loginLimiter);
app.post('/api/auth/reset-password', loginLimiter);
app.post('/api/auth/invite', loginLimiter);
app.put('/api/auth/members/:uuid', loginLimiter);
app.post('/api/portal/auth/login', loginLimiter);
app.post('/api/portal/auth/link', loginLimiter);
app.use('/api/auth', authRoutes);

// General API rate limit
app.use('/api', apiLimiter);

// Protected routes (require auth + tenant scope)
app.use('/api/contacts', authenticate, tenantScope, contactRoutes);
app.use('/api/posts', authenticate, tenantScope, postRoutes);
app.use('/api/addresses', authenticate, tenantScope, addressRoutes);
app.use('/api/relationships', authenticate, tenantScope, relationshipRoutes);
app.use('/api/labels', authenticate, tenantScope, labelRoutes);
app.use('/api/companies', authenticate, tenantScope, companyRoutes);
app.use('/api/life-events', authenticate, tenantScope, lifeEventRoutes);
app.use('/api/reminders', authenticate, tenantScope, reminderRoutes);
app.use('/api/notifications', authenticate, tenantScope, notificationRoutes);
app.use('/api/gifts', authenticate, tenantScope, giftRoutes);
// System routes — registration-status is public (must be before catch-all)
app.use('/api/system', (req, res, next) => {
  if (req.path === '/registration-status' && req.method === 'GET') return next();
  authenticate(req, res, next);
}, systemRoutes);
app.use('/api/portal', portalLimiter, portalRoutes); // Portal has own auth + stricter rate limit
app.use('/api/portal-admin', authenticate, tenantScope, portalAdminRoutes);
app.use('/api/import', authenticate, tenantScope, importRoutes);
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  keyGenerator: (req) => `export-${req.user?.id || req.ip}`,
  skip: (req) => !req.path.startsWith('/data') && !req.path.startsWith('/full') && !req.path.startsWith('/download'),
});
app.use('/api/export', exportLimiter, authenticate, tenantScope, exportRoutes);
app.use('/api', authenticate, tenantScope, uploadRoutes);

// Protected file serving — auth check + tenant validation
import path from 'path';
app.use('/uploads/', (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}, (req, res, next) => {
  // Try main auth first, fall back to portal auth
  authenticate(req, res, (err) => {
    if (err || !req.user) {
      // Try portal auth
      import('./middleware/portal-auth.js').then(({ portalAuthenticate }) => {
        portalAuthenticate(req, res, (portalErr) => {
          if (portalErr || !req.portal) return res.status(401).json({ error: 'Authentication required' });
          req.tenantId = req.portal.tenantId;
          next();
        });
      });
    } else {
      tenantScope(req, res, next);
    }
  });
}, async (req, res, next) => {
  // Validate that the requested file belongs to the user's tenant
  const filePath = req.path; // e.g. /contacts/{uuid}/photo.webp or /posts/{uuid}/media.webp
  const match = filePath.match(/^\/(contacts|posts|products)\/([a-f0-9-]+)\//);
  if (match) {
    const [, type, uuid] = match;
    const table = type === 'contacts' ? 'contacts' : type === 'posts' ? 'posts' : 'gift_products';
    const record = await db(table).where({ uuid, tenant_id: req.tenantId }).first();
    if (!record) {
      return res.status(403).json({ error: 'Access denied' });
    }
    // Portal guests: verify the file belongs to an allowed contact
    // Allow thumbnail avatars for all tenant contacts (needed for comment/reaction avatars)
    const isThumbnail = /\/_?photo_.*_thumb\.\w+$/.test(filePath);
    if (req.portal && type === 'contacts' && !isThumbnail && !req.portal.contactIds.includes(record.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.portal && type === 'posts') {
      const postContact = record.contact_id;
      const tagged = await db('post_contacts').where({ post_id: record.id }).whereIn('contact_id', req.portal.contactIds).first();
      if (!req.portal.contactIds.includes(postContact) && !tagged) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
  }
  next();
}, express.static(path.join(process.cwd(), '..', 'uploads'), {
  maxAge: '1d',
  setHeaders: (res) => {
    res.set('Cache-Control', 'private, max-age=86400');
  },
}));

// Error handler (must be last)
app.use(errorHandler);

// Session cleanup (hourly)
import { cleanExpiredSessions } from './utils/session.js';
setInterval(() => {
  cleanExpiredSessions().catch(() => {});
}, config.session.cleanupIntervalMs);

// Start server
app.listen(config.port, '0.0.0.0', () => {
  console.log(`WhoareYou API running on port ${config.port} (${config.env})`);
});

export default app;
