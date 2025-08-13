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
import { attachPlan } from './middleware/plan.js';
import { PLANS, getPlanFlags, getPlanLimits } from './config/plans.js';

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
  APP_SUBSCRIPTIONS_UPDATE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: '/api/webhooks',
    callback: async (topic, shop, body, webhookId) => {
      console.log('=== APP_SUBSCRIPTIONS_UPDATE webhook received ===');
      console.log('Shop:', shop);
      try {
        // Load offline session for this shop
        const offlineId = shopify.api.session.getOfflineId(shop);
        const session = await sessionStorage.loadSession(offlineId);
        if (!session) {
          console.warn('No offline session found for shop in APP_SUBSCRIPTIONS_UPDATE:', shop);
          return;
        }
        const client = new shopify.api.clients.Graphql({ session });
        const query = `#graphql
          query {
            currentAppInstallation {
              activeSubscriptions { name status }
            }
          }
        `;
        const resp = await client.request(query);
        const subs = resp?.data?.currentAppInstallation?.activeSubscriptions || [];
        const active = subs.find(s => s.status === 'ACTIVE' && s.name && s.name.startsWith('Honest UGC - '));
        if (!active) {
          // No active sub – default to starter
          await ShopInstallationsModel.update(shop, { plan_name: 'starter' });
          console.log('No active subscription found; set plan to starter for', shop);
          return;
        }
        let plan_name = 'starter';
        if (active.name.includes('Pro')) plan_name = 'pro';
        else if (active.name.includes('Scale')) plan_name = 'scale';
        else if (active.name.includes('Starter')) plan_name = 'starter';
        await ShopInstallationsModel.update(shop, { plan_name });
        console.log('Updated plan from webhook for', shop, '=>', plan_name);
      } catch (err) {
        console.error('Error handling APP_SUBSCRIPTIONS_UPDATE:', err);
      }
    }
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
    future: {
      unstable_managedPricingSupport: true
    }
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
    res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: blob:; img-src 'self' https: data: blob:; media-src 'self' https: data: blob:");
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
// Attach plan to admin requests
app.use('/api/admin', attachPlan);

// Admin routes
app.use('/api/admin', adminJobRoutes);
app.use('/api/admin', adminSubmissionRoutes);

// Admin: current plan info
app.get('/api/admin/me', async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const shop = session.shop;
    const install = await ShopInstallationsModel.getByShop(shop);
    const planRaw = install?.plan_name || null;
    const hasPlan = !!planRaw;
    const planKey = (planRaw || 'starter').toLowerCase();
    res.json({
      shop,
      plan: planRaw,
      hasPlan,
      features: getPlanFlags(planKey),
      limits: getPlanLimits(planKey),
      managedPricing: process.env.USE_MANAGED_PRICING === 'true'
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});
// Return Shopify-hosted managed pricing plans URL (JSON)
app.get('/api/admin/billing/managed-plans-url', async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const shop = session.shop;
    const appHandle = process.env.SHOPIFY_APP_HANDLE || 'honest-ugc';
    const storeSlug = shop.replace('.myshopify.com', '');
    const url = `https://admin.shopify.com/store/${encodeURIComponent(storeSlug)}/charges/${encodeURIComponent(appHandle)}/pricing_plans`;
    res.json({ url });
  } catch (e) {
    console.error('Managed plans URL error:', e);
    res.status(500).json({ error: 'Unable to get Shopify pricing URL' });
  }
});

// Redirect to Shopify-hosted managed pricing plans page
app.get('/api/admin/billing/redirect-managed-plans', async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const shop = session.shop;
    // Build hosted plans URL: https://admin.shopify.com/store/{shop}/charges/{app_handle}/pricing_plans
    const appHandle = process.env.SHOPIFY_APP_HANDLE || 'honest-ugc';
    const storeSlug = shop.replace('.myshopify.com', '');
    const url = `https://admin.shopify.com/store/${encodeURIComponent(storeSlug)}/charges/${encodeURIComponent(appHandle)}/pricing_plans`;
    res.set('X-Frame-Options', 'ALLOWALL');
    return res.redirect(url);
  } catch (e) {
    console.error('Managed plans redirect error:', e);
    res.status(500).send('Unable to open Shopify pricing page');
  }
});

// Admin: start subscription (GraphQL appSubscriptionCreate)
app.post('/api/admin/billing/subscribe', async (req, res) => {
  try {
    const { plan } = req.body || {};
    const planKey = (plan || '').toLowerCase();
    const selected = PLANS[planKey];
    if (!selected) return res.status(400).json({ error: 'INVALID_PLAN' });
    const session = res.locals.shopify.session;

    // Managed pricing mode: do not use Billing API; immediately set plan
    if (process.env.USE_MANAGED_PRICING === 'true') {
      // Respect whitelist (FREE_SHOPS) but we treat all shops the same here—no billing intent
      try {
        await ShopInstallationsModel.update(session.shop, { plan_name: planKey });
        return res.json({ devActivated: true, plan: planKey, devReason: 'managed_pricing' });
      } catch (e) {
        console.error('Managed pricing plan set failed:', e);
        return res.status(500).json({ error: 'FAILED_TO_SET_PLAN_MANAGED' });
      }
    }

    // Bypass billing for whitelisted shops (comma-separated in FREE_SHOPS)
    const freeShops = (process.env.FREE_SHOPS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    if (freeShops.includes((session.shop || '').toLowerCase())) {
      try {
        await ShopInstallationsModel.update(session.shop, { plan_name: planKey });
        return res.json({ devActivated: true, plan: planKey, devReason: 'free_shop' });
      } catch (e) {
        console.error('FREE_SHOPS plan set failed:', e);
        return res.status(500).json({ error: 'FAILED_TO_SET_PLAN_FOR_FREE_SHOP' });
      }
    }

    const client = new shopify.api.clients.Graphql({ session });
    const name = `Honest UGC - ${selected.displayName}`;
    const test = process.env.NODE_ENV !== 'production';
    const returnUrl = `${process.env.HOST}/api/billing/return?plan=${encodeURIComponent(planKey)}`;
    const mutation = `#graphql
      mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
        appSubscriptionCreate(
          name: $name,
          returnUrl: $returnUrl,
          test: $test,
          lineItems: $lineItems
        ) {
          confirmationUrl
          userErrors { field message }
        }
      }
    `;
    const variables = {
      name,
      test,
      returnUrl,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: selected.priceAmount, currencyCode: selected.priceCurrency },
              interval: selected.interval
            }
          }
        }
      ]
    };
    const resp = await client.request(mutation, { variables });
    const userErrors = resp?.data?.appSubscriptionCreate?.userErrors;
    const confirmationUrl = resp?.data?.appSubscriptionCreate?.confirmationUrl;
    if (userErrors && userErrors.length) {
      console.error('Billing userErrors:', userErrors);
      const mpError = userErrors.find(e => (e.message || '').includes('Managed Pricing Apps'));
      const allowDevFallback = process.env.ALLOW_DEV_ACTIVATION === 'true' || process.env.NODE_ENV !== 'production';
      if (mpError && allowDevFallback) {
        try {
          await ShopInstallationsModel.update(session.shop, { plan_name: planKey });
          return res.json({ devActivated: true, plan: planKey, devReason: 'managed_pricing_fallback' });
        } catch (e) {
          console.error('Failed to set plan in managed pricing fallback:', e);
        }
      }
      return res.status(400).json({ error: 'BILLING_ERROR', userErrors });
    }
    if (!confirmationUrl) return res.status(500).json({ error: 'NO_CONFIRMATION_URL' });
    res.json({ confirmationUrl });
  } catch (e) {
    console.error('Subscribe error:', e);
    res.status(500).json({ error: 'Failed to start subscription' });
  }
});

// Billing return URL handler: verify sub and persist plan
app.get('/api/billing/return', async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    // If not present (coming from Shopify redirect), load offline session via host param
    let shop = session?.shop;
    if (!shop && req.query.host) {
      try {
        const decodedHost = Buffer.from(req.query.host, 'base64').toString('utf-8');
        const match = decodedHost.match(/([^\/]+\.myshopify\.com)/);
        if (match) shop = match[1];
      } catch {}
    }
    if (!shop) return res.status(400).send('Shop missing');
    const planKey = (req.query.plan || '').toLowerCase();
    // Store intended plan optimistically; webhook will be source of truth
    if (planKey === 'starter' || planKey === 'scale' || planKey === 'pro') {
      await ShopInstallationsModel.update(shop, { plan_name: planKey });
    }
    // Redirect back into embedded app
    return res.redirect(`/?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(req.query.host || '')}&embedded=1`);
  } catch (e) {
    console.error('Billing return error:', e);
    return res.status(500).send('Subscription processed, but redirect failed. You can reopen the app from Shopify.');
  }
});

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

// FIXED: Public submission endpoint with better shop domain handling (supports multiple media files)
app.post('/api/public/submit', upload.array('media', 10), async (req, res) => {
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
    const paypalEmail = (req.body.paypalEmail || '').trim() || null;

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
    let mediaUrls = [];
    const files = Array.isArray(req.files) ? req.files : (req.file ? [req.file] : []);
    if (files.length > 0) {
      const hasS3Creds = (
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        process.env.AWS_REGION &&
        process.env.S3_BUCKET_NAME
      );

      for (const f of files) {
        let uploadedUrl = null;
        const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.originalname}`;
        if (hasS3Creds) {
          try {
            uploadedUrl = await uploadToS3(f, uniqueName);
          } catch (error) {
            console.error('S3 upload failed:', error);
            const localPath = path.join(uploadsDir, uniqueName);
            fs.writeFileSync(localPath, f.buffer);
            uploadedUrl = `/uploads/${uniqueName}`;
          }
        } else {
          const localPath = path.join(uploadsDir, uniqueName);
          fs.writeFileSync(localPath, f.buffer);
          uploadedUrl = `/uploads/${uniqueName}`;
        }
        mediaUrls.push(uploadedUrl);
      }
      mediaUrl = mediaUrls[0] || null;
    }

    // When creating the submission, ensure shopDomain is passed correctly
    const submission = await SubmissionsModel.create({
      customerEmail,
      type,
      content,
      mediaUrl,
      mediaUrls,
      status: 'pending',
      jobId: req.body.jobId || null,
      shopDomain,
      paypalEmail,
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
  
  // This is a regular website visit, redirect to /home which serves the homepage from pages.js
  console.log('Serving homepage for:', req.headers.referer || 'direct visit');
  return res.redirect('/home');
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
    
    const initialView = (req.query.view || 'submissions');
    res.render('admin-dashboard', {
      shop,
      submitLink,
      emailSetupComplete,
      customizations,
      env: process.env,
      initialView
    });
  } catch (error) {
    console.error('Error in root route:', error);
    res.status(500).send('An error occurred. Please try again.');
  }
});

// App Bridge sidebar paths that map to views
const appViewRoutes = [
  { path: '/app/submissions', view: 'submissions' },
  { path: '/app/jobs', view: 'jobs' },
  { path: '/app/customizations', view: 'customizations' },
  { path: '/app/email-settings', view: 'email-settings' },
  { path: '/app/plans', view: 'plans' },
];
for (const { path: p, view } of appViewRoutes) {
  app.get(p, ensureSession, async (req, res) => {
    try {
      const session = res.locals.shopify.session;
      const shop = session.shop;
      const submitLink = `${process.env.HOST}/jobs/${encodeURIComponent(shop)}`;
      let customizations = {};
      let emailSetupComplete = false;
      try {
        customizations = await CustomizationsModel.getByShop(shop) || {};
        emailSetupComplete = isEmailSetupComplete(customizations);
      } catch (error) {
        console.error('Error loading customizations:', error);
      }
      res.render('admin-dashboard', {
        shop,
        submitLink,
        emailSetupComplete,
        customizations,
        env: process.env,
        initialView: view
      });
    } catch (e) {
      console.error('Error rendering app view:', e);
      res.status(500).send('Failed to load');
    }
  });
}

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

// Serve logo asset from repo root
app.get('/assets/logo.png', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'honestugc-logo.png'));
});



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