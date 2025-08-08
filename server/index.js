// 0️⃣ Load .env first so process.env is populated
import dotenv from 'dotenv';
dotenv.config();

// 1️⃣ Patch Node with the Shopify-API v11 adapter
import '@shopify/shopify-api/adapters/node';

// 2️⃣ Pull in the v11 initializer
import { LATEST_API_VERSION, DeliveryMethod } from '@shopify/shopify-api';

// 3️⃣ Everything else comes after
import express from 'express';
import { shopifyApp } from '@shopify/shopify-app-express';
import { SQLiteSessionStorage } from '@shopify/shopify-app-session-storage-sqlite';
import { PostgreSQLSessionStorage } from '@shopify/shopify-app-session-storage-postgresql';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { SubmissionsModel } from './models/submissions.js';
import { adminSubmissionRoutes } from './routes/submissions.js';
import { uploadToS3 } from './setup-s3.js';
import {
  sendNotificationEmail,
  sendCustomerConfirmationEmail,
  sendCustomerStatusEmail,
  sendRewardCodeEmail,
  sendGiftCardEmail,
  sendFreeProductEmail,
} from './services/email.js';
import { JobsModel } from './models/jobs.js';
import { ShopifyDiscountService } from './services/shopifyDiscount.js';
import { RewardsModel } from './models/rewards.js';
import { pageRoutes } from './routes/pages.js';
import { publicJobRoutes, adminJobRoutes } from './routes/jobs.js';
import { CustomizationsModel } from './models/customizations.js';
import { ShopInstallationsModel } from './models/shopInstallations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'));
    }
  },
});

// Initialize Shopify Express app
let sessionStorage;

if (process.env.NODE_ENV === 'production') {
  sessionStorage = new PostgreSQLSessionStorage(process.env.DATABASE_URL);
  console.log('Using PostgreSQL session storage for production');
} else {
  sessionStorage = new SQLiteSessionStorage(path.join(__dirname, '../database/session.db'));
  console.log('Using SQLite session storage for development');
}

// Define webhook handlers separately
const webhookHandlers = {
  APP_UNINSTALLED: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: '/api/webhooks',
    callback: async (topic, shop, body, webhookId) => {
      console.log('=== APP_UNINSTALLED webhook received ===');
      console.log('Topic:', topic);
      console.log('Shop:', shop);
      
      try {
        // Clean up all shop data
        await CustomizationsModel.redactShopData(shop);
        await JobsModel.redactShopData(shop);
        await RewardsModel.redactShopData(shop);
        await ShopInstallationsModel.delete(shop);
        
        // Delete all sessions for this shop
        const sessions = await sessionStorage.findSessionsByShop(shop);
        if (sessions && sessions.length > 0) {
          for (const session of sessions) {
            await sessionStorage.deleteSession(session.id);
          }
        }
        
        console.log('Shop data cleaned up successfully for:', shop);
      } catch (error) {
        console.error('Error cleaning up shop data for uninstall:', error);
      }
    },
  },
  CUSTOMERS_REDACT: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: '/api/webhooks',
    callback: async (topic, shop, body, webhookId) => {
      console.log('=== CUSTOMERS_REDACT webhook received ===');
      console.log('Topic:', topic);
      console.log('Shop:', shop);
      
      try {
        const payload = JSON.parse(body);
        console.log('Customer redact request for:', shop, payload.customer.email);
        await SubmissionsModel.redactCustomerData(shop, payload.customer.email);
        console.log('Customer data redacted successfully');
      } catch (error) {
        console.error('Error processing customer redact:', error);
      }
    },
  },
  CUSTOMERS_DATA_REQUEST: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: '/api/webhooks',
    callback: async (topic, shop, body, webhookId) => {
      console.log('=== CUSTOMERS_DATA_REQUEST webhook received ===');
      console.log('Topic:', topic);
      console.log('Shop:', shop);
      
      try {
        const payload = JSON.parse(body);
        console.log('Customer data request for:', shop, payload.customer.email);
        const customerData = await SubmissionsModel.getCustomerData(shop, payload.customer.email);
        console.log('Customer data retrieved:', customerData);
      } catch (error) {
        console.error('Error processing customer data request:', error);
      }
    },
  },
  SHOP_REDACT: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: '/api/webhooks',
    callback: async (topic, shop, body, webhookId) => {
      console.log('=== SHOP_REDACT webhook received ===');
      console.log('Topic:', topic);
      console.log('Shop:', shop);
      
      try {
        await SubmissionsModel.redactShopData(shop);
        await JobsModel.redactShopData(shop);
        await CustomizationsModel.redactShopData(shop);
        await RewardsModel.redactShopData(shop);
        console.log('Shop data redacted successfully');
      } catch (error) {
        console.error('Error processing shop redact:', error);
      }
    },
  },
};

const shopify = shopifyApp({
  api: {
    apiKey:       process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes:       ['write_discounts', 'read_customers', 'write_price_rules'],
    hostName:     process.env.HOST.replace(/^https?:\/\//, ''),
    apiVersion:   LATEST_API_VERSION,
  },
  auth: {
    path:         '/api/auth',
    callbackPath: '/api/auth/callback',
  },
  webhooks: {
    path: '/api/webhooks',
    webhookHandlers: webhookHandlers // Note: it's under webhookHandlers property
  },
  sessionStorage,
  useOnlineTokens: false,
  isEmbeddedApp: true,
});

console.log('Shopify API configuration:', {
  apiKey: process.env.SHOPIFY_API_KEY,
  hasApiSecret: !!process.env.SHOPIFY_API_SECRET,
  apiSecretLength: process.env.SHOPIFY_API_SECRET?.length,
  host: process.env.HOST,
  apiVersion: LATEST_API_VERSION
});

const app = express();
app.set('shopify', shopify);

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Configure EJS templating
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Helper function to check if email setup is complete
function isEmailSetupComplete(customizations) {
  return customizations && 
         customizations.email_from_name && 
         customizations.notification_email &&
         customizations.email_from_name.trim() !== '' &&
         customizations.notification_email.trim() !== '';
}

// IMPROVED: Helper function to get shop domain from various sources
function getShopDomain(req, res) {
  // Try multiple sources
  const shopFromQuery = req.query.shop;
  const shopFromParams = req.params.shop;
  const shopFromBody = req.body?.shop;
  const shopFromSession = res.locals?.shopify?.session?.shop;
  
  // Also try from hidden form field (if you add one)
  const shopFromFormField = req.body?.shopDomain;
  
  // Also try from referrer header
  let shopFromReferrer = null;
  if (req.headers.referer) {
    const match = req.headers.referer.match(/shop=([^&]+)/);
    if (match) {
      shopFromReferrer = decodeURIComponent(match[1]);
    }
  }
  
  const shop = shopFromQuery || shopFromParams || shopFromBody || shopFromFormField || shopFromReferrer || shopFromSession;
  
  // Log for debugging
  if (!shop) {
    console.log('Could not find shop domain from:', {
      query: req.query,
      params: req.params,
      body: req.body,
      referrer: req.headers.referer,
      session: res.locals?.shopify?.session
    });
  }
  
  return shop;
}

// Session token validation middleware for API routes
async function validateSessionToken(req, res, next) {
  try {
    // Use Shopify's built-in session validation
    const session = await shopify.api.session.getCurrentId({
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });

    if (!session) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'No valid session found' 
      });
    }

    // Load the full session from storage
    const fullSession = await sessionStorage.loadSession(session);
    
    if (!fullSession) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Session not found in storage' 
      });
    }

    // Attach session to response locals
    res.locals.shopify = { session: fullSession };
    next();
  } catch (error) {
    console.error('Session validation error:', error);
    
    // Try alternative method using the Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'No session token provided' 
      });
    }
    
    const token = authHeader.substring(7);
    
    try {
      // For embedded apps, the token is the id_token from Shopify
      // Decode it manually (in production, verify the signature)
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }
      
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      // Verify token hasn't expired
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Session token expired' 
        });
      }
      
      // Get shop domain from token
      const shop = payload.dest.replace('https://', '');
      
      // Load session from storage
      const sessionId = shopify.api.session.getOfflineId(shop);
      const session = await sessionStorage.loadSession(sessionId);
      
      if (!session) {
        return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'No valid session found. Please reinstall the app.' 
        });
      }
      
      // Attach session to response locals
      res.locals.shopify = { session };
      next();
    } catch (innerError) {
      console.error('Token decode error:', innerError);
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid session token' 
      });
    }
  }
}

// Custom middleware to ensure session exists for embedded app pages
async function ensureSession(req, res, next) {
  // First try the standard location
  if (res.locals?.shopify?.session) {
    return next();
  }
  
  // Try to get shop from various sources
  let shop = req.query.shop;
  
  if (!shop && req.query.host) {
    try {
      const decodedHost = Buffer.from(req.query.host, 'base64').toString('utf-8');
      const match = decodedHost.match(/([^\/]+\.myshopify\.com)/);
      if (match) {
        shop = match[1];
      }
    } catch (e) {
      console.error('Failed to decode host:', e);
    }
  }
  
  if (!shop) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Error - Honest UGC</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; text-align: center;">
          <h1>Shop Required</h1>
          <p>Please access this app through your Shopify admin.</p>
        </body>
      </html>
    `);
  }
  
  try {
    const sessionId = shopify.api.session.getOfflineId(shop);
    const session = await sessionStorage.loadSession(sessionId);
    
    if (!session) {
      // No session found, redirect to auth
      return res.redirect(`/api/auth?shop=${shop}`);
    }
    
    // Set up res.locals to match what other middleware expects
    res.locals = res.locals || {};
    res.locals.shopify = { session };
    
    next();
  } catch (error) {
    console.error('Error loading session:', error);
    res.status(500).send('Failed to load session');
  }
}

// #1  Serve static files
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));


// #2 Security headers middleware
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Only apply strict security headers to admin/API routes, not public pages
  if (req.path.startsWith('/api/admin') || (req.path === '/' && req.query.embedded)) {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors https://*.myshopify.com https://admin.shopify.com");
  } else if (req.path.startsWith('/jobs/') || req.path.startsWith('/submit')) {
    // Public pages - use minimal CSP to allow screenshots
    res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data:; img-src 'self' https: data: blob:;");
  } else if (!req.path.startsWith('/api/auth')) {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors https://*.myshopify.com https://admin.shopify.com");
  }
  
  next();
});

// 3. CSP Headers from Shopify - only for embedded admin pages
app.use((req, res, next) => {
  // Only apply Shopify's strict CSP to embedded admin pages
  if (req.path === '/' && req.query.embedded) {
    return shopify.cspHeaders()(req, res, next);
  }
  next();
});

// #4 Webhook processing - simplified since handlers are in config
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: webhookHandlers })
);

// 5. NOW add body parsing for other routes
app.use(express.json());

// 6. Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// Debug endpoint to check available methods
app.get('/api/debug/shopify-methods', (req, res) => {
  const methods = {
    shopifyKeys: Object.keys(shopify),
    apiKeys: shopify.api ? Object.keys(shopify.api) : [],
    configKeys: shopify.config ? Object.keys(shopify.config) : [],
    utilsKeys: shopify.api?.utils ? Object.keys(shopify.api.utils) : []
  };
  
  res.json(methods);
});

// Set up Shopify authentication
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  async (req, res, next) => {
    try {
      const session = res.locals.shopify.session;
      if (session && session.accessToken) {
        console.log('OAuth callback - Shop:', session.shop);
        
        // Shopify App Express automatically registers webhooks defined in config
        // No need to manually register them
        
        // Create shop installation record
        try {
          const shopData = {
            shop_domain: session.shop,
            access_token: session.accessToken,
            scope: session.scope,
            email: session.onlineAccessInfo?.associated_user?.email || null,
          };
          
          await ShopInstallationsModel.create(shopData);
          console.log('Shop installation record created for:', session.shop);
        } catch (installationError) {
          console.error('Error creating shop installation record:', installationError);
        }
      }
      next();
    } catch (error) {
      console.error('Error in auth callback:', error);
      next();
    }
  },
  shopify.redirectToShopifyOrAppRoot()
);

// Public routes (no auth required)
app.use('/api/public', publicJobRoutes);

// Public pages
app.get('/submit', (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Error - Honest UGC</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; text-align: center;">
          <h1>Shop Required</h1>
          <p>Please access this page through your store's UGC job listing.</p>
        </body>
      </html>
    `);
  }
  res.sendFile(path.join(__dirname, 'public', 'submit.html'));
});

app.get('/jobs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'jobs.html'));
});

app.get('/jobs/:shop', (req, res) => {
  if (!req.params.shop || req.params.shop.trim() === '') {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'jobs.html'));
});

// Admin health check endpoint (uses session token)
app.get('/api/admin/health', validateSessionToken, (req, res) => {
  const session = res.locals.shopify.session;
  res.json({
    healthy: true,
    shop: session.shop,
    timestamp: new Date().toISOString()
  });
});

// Apply session token validation to all admin routes
app.use('/api/admin', validateSessionToken);

// Admin routes
app.use('/api/admin', adminJobRoutes);
app.use('/api/admin', adminSubmissionRoutes);

// Get customizations (public)
app.get('/api/public/customizations', async (req, res) => {
  try {
    const shopDomain = getShopDomain(req, res);
    const customizations = await CustomizationsModel.getByShop(shopDomain) || {};
    res.json(customizations);
  } catch (error) {
    console.error('Error fetching customizations:', error);
    res.json({});
  }
});

// FIXED: Public submission endpoint with better shop domain handling
app.post('/api/public/submit', upload.single('media'), async (req, res) => {
  try {
    let shopDomain = getShopDomain(req, res);
    
    // CRITICAL FIX: Ensure we get shop domain from the job if not in request
    if (!shopDomain && req.body.jobId) {
      const job = await JobsModel.getById(req.body.jobId);
      if (job && job.shop_domain) {
        shopDomain = job.shop_domain;
        console.log('Got shop domain from job:', shopDomain);
      }
    }
    
    // Additional fallback: Try to extract from referrer or other headers
    if (!shopDomain && req.headers.referer) {
      const match = req.headers.referer.match(/shop=([^&]+)/);
      if (match) {
        shopDomain = decodeURIComponent(match[1]);
        console.log('Got shop domain from referer:', shopDomain);
      }
    }

    if (!shopDomain) {
      console.error('No shop domain found in submission request:', {
        body: req.body,
        query: req.query,
        headers: req.headers
      });
      return res.status(400).json({
        success: false,
        message: 'Shop domain is required'
      });
    }

    // Log for debugging
    console.log('Creating submission for shop:', shopDomain);

    const { customerEmail, type, content } = req.body;
    if (!customerEmail || !type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: customerEmail, type'
      });
    }

    // Check email configuration BEFORE processing the submission
    const customizations = await CustomizationsModel.getByShop(shopDomain) || {};
    
    if (!isEmailSetupComplete(customizations)) {
      // Return 400 (Bad Request) instead of 503, with a user-friendly message
      return res.status(400).json({
        success: false,
        error: 'EMAIL_NOT_CONFIGURED',
        message: 'This store is not yet ready to accept submissions',
        userMessage: 'We apologize, but this store hasn\'t finished setting up their submission system yet. Please contact the store directly or try again later.',
        details: 'The store administrator needs to configure email settings before submissions can be accepted.'
      });
    }

    if (req.body.jobId) {
      const job = await JobsModel.getById(req.body.jobId);
      if (!job) {
        return res.status(400).json({
          success: false,
          message: 'Job not found'
        });
      }
      if (job.spots_filled >= job.spots_available) {
        return res.status(400).json({
          success: false,
          message: 'This job is no longer accepting submissions'
        });
      }
    }

    let mediaUrl = null;
    if (req.file) {
      const hasS3Creds = (
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        process.env.AWS_REGION &&
        process.env.S3_BUCKET_NAME
      );
      
      if (hasS3Creds) {
        try {
          mediaUrl = await uploadToS3(req.file, req.file.originalname);
        } catch (error) {
          console.error('S3 upload failed:', error);
          const filename = Date.now() + '-' + req.file.originalname;
          const localPath = path.join(uploadsDir, filename);
          fs.writeFileSync(localPath, req.file.buffer);
          mediaUrl = `/uploads/${filename}`;
        }
      } else {
        const filename = Date.now() + '-' + req.file.originalname;
        const localPath = path.join(uploadsDir, filename);
        fs.writeFileSync(localPath, req.file.buffer);
        mediaUrl = `/uploads/${filename}`;
      }
    }

    // When creating the submission, ensure shopDomain is passed correctly
    const submission = await SubmissionsModel.create({
      customerEmail,
      type,
      content,
      mediaUrl,
      status: 'pending',
      jobId: req.body.jobId || null,
      shopDomain: shopDomain // <-- This is critical!
    });

    console.log('Submission created with number:', submission.shop_submission_number, 'for shop:', shopDomain);

    let jobName = 'General Submission';
    let job = null;
    if (req.body.jobId) {
      job = await JobsModel.getById(req.body.jobId);
      if (job) {
        jobName = job.title;
      }
    }

    const notificationEmailTo = customizations.notification_email;
    if (!notificationEmailTo) {
      console.error('No notification email configured for shop:', shopDomain);
      // Don't fail the submission, but log the error
    }

    const appUrl = shopDomain ? `https://${shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}` : null;

    // Send emails in the background - don't fail the submission if email fails
    try {
      await sendNotificationEmail({
        to: notificationEmailTo,
        subject: 'New UGC Submission Received',
        text: `A new submission was received from ${customerEmail}.\nJob: ${jobName}\nType: ${type}\n\nView in app: ${appUrl}`,
        html: `<p>A new submission was received from <b>${customerEmail}</b>.</p><p><strong>Job:</strong> ${jobName}</p><p><strong>Type:</strong> ${type}</p><p><br><a href="${appUrl}" style="background: #008060; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View in App</a></p>`
      });

      await sendCustomerConfirmationEmail({
        to: customerEmail,
        customerName: customerEmail,
        type,
        customSubject: customizations.email_subject_confirmation,
        customBody: customizations.email_body_confirmation,
        customizations
      });
    } catch (emailError) {
      console.error('Error sending emails:', emailError);
      // Don't fail the submission if emails fail
    }

    res.json({
      success: true,
      message: 'Submission received!',
      submissionId: submission.id,
      submissionNumber: submission.shop_submission_number // Include this in the response
    });
  } catch (error) {
    console.error('Error saving submission:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save submission',
      error: error.message
    });
  }
});

// Get customizations (admin route with session validation)
app.get('/api/admin/customizations', async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const customizations = await CustomizationsModel.getByShop(shop);
    res.json(customizations || {});
  } catch (error) {
    console.error('Error loading customizations:', error);
    res.status(500).json({ error: 'Failed to load customizations' });
  }
});

// Save customizations (admin route with session validation)
app.post('/api/admin/customizations', async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    // Get existing customizations to preserve email settings
    const existingCustomizations = await CustomizationsModel.getByShop(shop) || {};
    
    // Merge existing data with new customization data (preserves email settings)
    const updatedCustomizations = {
      ...existingCustomizations,
      ...req.body
    };
    
    const customizations = await CustomizationsModel.upsert(shop, updatedCustomizations);
    res.json({ success: true, customizations });
  } catch (error) {
    console.error('Error saving customizations:', error);
    res.status(500).json({ error: 'Failed to save customizations' });
  }
});

// Save email settings (admin route with session validation)
app.post('/api/admin/email-settings', async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    const existingCustomizations = await CustomizationsModel.getByShop(shop) || {};
    
    const updatedCustomizations = {
      ...existingCustomizations,
      email_subject_confirmation: req.body.emailSubjectConfirmation,
      email_body_confirmation: req.body.emailBodyConfirmation,
      email_subject_rejected: req.body.emailSubjectRejected,
      email_body_rejected: req.body.emailBodyRejected,
      email_subject_reward: req.body.emailSubjectReward,
      email_body_reward: req.body.emailBodyReward,
      email_subject_giftcard: req.body.emailSubjectGiftcard,
      email_body_giftcard: req.body.emailBodyGiftcard,
      email_subject_product: req.body.emailSubjectProduct,
      email_body_product: req.body.emailBodyProduct,
      email_from_name: req.body.emailFromName,
      email_reply_to: req.body.emailReplyTo,
      notification_email: req.body.notificationEmail
    };
    
    const customizations = await CustomizationsModel.upsert(shop, updatedCustomizations);
    res.json({ success: true, customizations });
  } catch (error) {
    console.error('Error saving email settings:', error);
    res.status(500).json({ error: 'Failed to save email settings' });
  }
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Allow: /jobs/
Allow: /privacy
Allow: /terms
Disallow: /api/
Disallow: /admin/
Disallow: /submit

Sitemap: ${process.env.HOST}/sitemap.xml`);
});

// Add a sitemap.xml route

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${process.env.HOST}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${process.env.HOST}/privacy</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${process.env.HOST}/terms</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>`);
});

// Debug endpoint
app.get('/api/debug/session', ensureSession, async (req, res) => {
  const session = res.locals.shopify.session;
  res.json({
    hasSession: !!session,
    shop: session?.shop,
    hasAccessToken: !!session?.accessToken,
    sessionId: session?.id,
    scope: session?.scope,
    queryParams: req.query,
    headers: {
      host: req.headers.host,
      referer: req.headers.referer,
      userAgent: req.headers['user-agent']
    }
  });
});

// Homepage route - serve homepage for non-Shopify requests
app.get('/', (req, res, next) => {
  // Check if this is a Shopify app request
  const isShopifyRequest = req.query.embedded || 
                          req.query.shop || 
                          req.headers.referer?.includes('myshopify.com') || 
                          req.headers.referer?.includes('admin.shopify.com');
  
  if (isShopifyRequest) {
    // This is a Shopify app request, continue to next middleware (admin dashboard)
    return next();
  }
  
  // This is a regular website visit, serve the homepage
  console.log('Serving homepage for:', req.headers.referer || 'direct visit');
  
  // Import and serve the homepage HTML directly
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Honest UGC - Turn Customer Love Into Authentic Content</title>
        <meta name="description" content="The easiest way to collect authentic user-generated content from your customers. Boost trust, increase conversions, and build a library of social proof.">
        
        <!-- Fonts -->
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            :root {
                --primary: #008060;
                --primary-dark: #006e52;
                --secondary: #f6f6f7;
                --text-dark: #202223;
                --text-light: #6d7175;
                --accent: #5c6ac4;
                --success: #008060;
                --gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: var(--text-dark);
                overflow-x: hidden;
            }
            
            /* Navigation */
            nav {
                position: fixed;
                top: 0;
                width: 100%;
                background: rgba(255, 255, 255, 0.98);
                backdrop-filter: blur(10px);
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                z-index: 1000;
                padding: 20px 0;
            }
            
            .nav-container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 0 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .logo {
                font-size: 24px;
                font-weight: 700;
                color: var(--primary);
                text-decoration: none;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .logo::before {
                content: "✨";
                font-size: 28px;
            }
            
            .nav-links {
                display: flex;
                gap: 30px;
                align-items: center;
            }
            
            .nav-links a {
                color: var(--text-dark);
                text-decoration: none;
                font-weight: 500;
                transition: color 0.3s;
            }
            
            .nav-links a:hover {
                color: var(--primary);
            }
            
            .cta-button {
                background: var(--primary);
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                transition: all 0.3s;
            }
            
            .cta-button:hover {
                background: var(--primary-dark);
                transform: translateY(-2px);
            }
            
            /* Hero Section */
            .hero {
                padding: 120px 20px 80px;
                background: var(--gradient);
                color: white;
                text-align: center;
            }
            
            .hero h1 {
                font-size: 3.5rem;
                font-weight: 800;
                margin-bottom: 20px;
                line-height: 1.2;
            }
            
            .hero p {
                font-size: 1.25rem;
                margin-bottom: 40px;
                opacity: 0.9;
                max-width: 600px;
                margin-left: auto;
                margin-right: auto;
            }
            
            /* Features Section */
            .features {
                padding: 80px 20px;
                background: white;
            }
            
            .container {
                max-width: 1200px;
                margin: 0 auto;
            }
            
            .features h2 {
                text-align: center;
                font-size: 2.5rem;
                margin-bottom: 60px;
                color: var(--text-dark);
            }
            
            .features-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 40px;
            }
            
            .feature {
                text-align: center;
                padding: 40px 20px;
                border-radius: 12px;
                background: var(--secondary);
                transition: transform 0.3s;
            }
            
            .feature:hover {
                transform: translateY(-5px);
            }
            
            .feature-icon {
                font-size: 3rem;
                margin-bottom: 20px;
            }
            
            .feature h3 {
                font-size: 1.5rem;
                margin-bottom: 15px;
                color: var(--text-dark);
            }
            
            .feature p {
                color: var(--text-light);
                line-height: 1.6;
            }
            
            /* Footer */
            footer {
                background: var(--text-dark);
                color: white;
                padding: 60px 20px 20px;
            }
            
            .footer-content {
                max-width: 1200px;
                margin: 0 auto;
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 40px;
            }
            
            .footer-section h3 {
                margin-bottom: 20px;
                color: var(--primary);
            }
            
            .footer-section ul {
                list-style: none;
            }
            
            .footer-section ul li {
                margin-bottom: 10px;
            }
            
            .footer-section ul li a {
                color: #ccc;
                text-decoration: none;
                transition: color 0.3s;
            }
            
            .footer-section ul li a:hover {
                color: white;
            }
            
            .footer-bottom {
                text-align: center;
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #333;
                color: #ccc;
            }
            
            @media (max-width: 768px) {
                .hero h1 {
                    font-size: 2.5rem;
                }
                
                .nav-links {
                    display: none;
                }
                
                .features-grid {
                    grid-template-columns: 1fr;
                }
            }
        </style>
    </head>
    <body>
        <nav>
            <div class="nav-container">
                <a href="/" class="logo">Honest UGC</a>
                <div class="nav-links">
                    <a href="#features">Features</a>
                    <a href="#pricing">Pricing</a>
                    <a href="/contact">Contact</a>
                    <a href="/privacy">Privacy</a>
                    <a href="/terms">Terms</a>
                </div>
            </div>
        </nav>
        
        <section class="hero">
            <div class="container">
                <h1>Turn Customer Love Into Authentic Content</h1>
                <p>The easiest way to collect authentic user-generated content from your customers. Boost trust, increase conversions, and build a library of social proof.</p>
                <a href="https://apps.shopify.com/honest-ugc" class="cta-button">Get Started on Shopify</a>
            </div>
        </section>
        
        <section class="features" id="features">
            <div class="container">
                <h2>Why Choose Honest UGC?</h2>
                <div class="features-grid">
                    <div class="feature">
                        <div class="feature-icon">🎯</div>
                        <h3>Easy Setup</h3>
                        <p>Get started in minutes with our simple Shopify app installation. No technical knowledge required.</p>
                    </div>
                    <div class="feature">
                        <div class="feature-icon">💎</div>
                        <h3>Authentic Content</h3>
                        <p>Collect real customer photos and videos that showcase your products in authentic, everyday situations.</p>
                    </div>
                    <div class="feature">
                        <div class="feature-icon">🚀</div>
                        <h3>Automated Rewards</h3>
                        <p>Automatically send discount codes, gift cards, or free products to customers who submit content.</p>
                    </div>
                    <div class="feature">
                        <div class="feature-icon">📈</div>
                        <h3>Boost Conversions</h3>
                        <p>User-generated content increases trust and can boost conversion rates by up to 161%.</p>
                    </div>
                    <div class="feature">
                        <div class="feature-icon">🛡️</div>
                        <h3>Secure & Reliable</h3>
                        <p>Built on Shopify's secure platform with enterprise-grade reliability and data protection.</p>
                    </div>
                    <div class="feature">
                        <div class="feature-icon">📱</div>
                        <h3>Mobile Optimized</h3>
                        <p>Perfect experience on all devices. Customers can easily submit content from their phones.</p>
                    </div>
                </div>
            </div>
        </section>
        
        <footer>
            <div class="footer-content">
                <div class="footer-section">
                    <h3>Honest UGC</h3>
                    <p>Helping Shopify merchants collect authentic user-generated content to boost sales and build trust.</p>
                </div>
                <div class="footer-section">
                    <h3>Quick Links</h3>
                    <ul>
                        <li><a href="#features">Features</a></li>
                        <li><a href="#pricing">Pricing</a></li>
                        <li><a href="/contact">Contact</a></li>
                    </ul>
                </div>
                <div class="footer-section">
                    <h3>Legal</h3>
                    <ul>
                        <li><a href="/privacy">Privacy Policy</a></li>
                        <li><a href="/terms">Terms of Service</a></li>
                    </ul>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2024 Honest UGC. All rights reserved. Built with ❤️ for Shopify merchants.</p>
            </div>
        </footer>
    </body>
    </html>
  `);
});

// Root route - Admin dashboard (embedded app)
// Uses custom ensureSession middleware instead of shopify.ensureInstalledOnShop()
app.get('/', ensureSession, async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    console.log('Root route accessed:', {
      shop,
      sessionId: session.id,
      hasAccessToken: !!session.accessToken,
      queryParams: req.query
    });
    
    const submitLink = `${process.env.HOST}/jobs/${encodeURIComponent(shop)}`;
    
    let customizations = {};
    let emailSetupComplete = false;
    
    try {
      customizations = await CustomizationsModel.getByShop(shop) || {};
      emailSetupComplete = isEmailSetupComplete(customizations);
    } catch (error) {
      console.error('Error loading customizations:', error);
    }
    
    console.log('Rendering admin dashboard for shop:', shop);
    
    res.render('admin-dashboard', {
      shop,
      submitLink,
      emailSetupComplete,
      customizations,
      env: process.env
    });
  } catch (error) {
    console.error('Error in root route:', error);
    res.status(500).send('An error occurred. Please try again.');
  }
});

// Install route for new shops
app.get('/install', (req, res) => {
  const shop = req.query.shop;
  if (!shop || !shop.match(/[a-zA-Z0-9-]+\.myshopify\.com/)) {
    return res.status(400).send('Invalid shop parameter');
  }
  
  res.redirect(`/api/auth?shop=${shop}`);
});

// Public pages (homepage, etc.) - only for non-app routes
app.use('/home', pageRoutes);
app.use('/about', pageRoutes);
app.use('/pricing', pageRoutes);
app.use('/contact', pageRoutes);
app.use('/privacy', pageRoutes);
app.use('/terms', pageRoutes);



// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Ngrok URL: ${process.env.HOST}`);
  console.log(`Install URL: ${process.env.HOST}/api/auth?shop=YOUR-SHOP.myshopify.com`);
});