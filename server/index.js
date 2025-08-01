// 0️⃣ Load .env first so process.env is populated
import dotenv from 'dotenv';
dotenv.config();

// 1️⃣ Patch Node with the Shopify-API v11 adapter
import '@shopify/shopify-api/adapters/node';

// 2️⃣ Pull in the v11 initializer
import { LATEST_API_VERSION, DeliveryMethod } from '@shopify/shopify-api';

// 4️⃣ Everything else comes after
import express from 'express';
import { shopifyApp } from '@shopify/shopify-app-express';
import { SQLiteSessionStorage } from '@shopify/shopify-app-session-storage-sqlite';
import { MemorySessionStorage } from '@shopify/shopify-app-session-storage-memory';
import { PostgreSQLSessionStorage } from '@shopify/shopify-app-session-storage-postgresql';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { SubmissionsModel } from './models/submissions.js';
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
  // Use PostgreSQL in production - pass connection string directly
  sessionStorage = new PostgreSQLSessionStorage(process.env.DATABASE_URL);
  console.log('Using PostgreSQL session storage for production');
} else {
  // Use SQLite in development
  sessionStorage = new SQLiteSessionStorage(path.join(__dirname, '../database/session.db'));
  console.log('Using SQLite session storage for development');
}

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
  },
  sessionStorage,
});

const app = express();

// Trust proxy for rate limiting (needed for ngrok/proxy environments)
app.set('trust proxy', 1);

// Configure EJS templating
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 3. Add the webhook registration function (from previous artifact)
async function registerWebhooks(session) {
      const client = new shopify.api.clients.Rest({ session });
  
  const webhooks = [
    {
      topic: 'customers/redact',
      address: `${process.env.HOST}${shopify.config.webhooks.path}`,
      format: 'json'
    },
    {
      topic: 'customers/data_request',
      address: `${process.env.HOST}${shopify.config.webhooks.path}`,
      format: 'json'
    },
    {
      topic: 'shop/redact',
      address: `${process.env.HOST}${shopify.config.webhooks.path}`,
      format: 'json'
    },
    {
      topic: 'app/uninstalled',
      address: `${process.env.HOST}${shopify.config.webhooks.path}`,
      format: 'json'
    }
  ];

  for (const webhook of webhooks) {
    try {
      await client.post({
        path: 'webhooks',
        data: webhook
      });
      console.log(`Registered webhook: ${webhook.topic}`);
    } catch (error) {
      if (error.response?.code === 422) {
        console.log(`Webhook ${webhook.topic} already exists`);
      } else {
        console.error(`Failed to register webhook ${webhook.topic}:`, error);
      }
    }
  }
}

// Helper function to check if email setup is complete
function isEmailSetupComplete(customizations) {
  return customizations && 
         customizations.email_from_name && 
         customizations.notification_email &&
         customizations.email_from_name.trim() !== '' &&
         customizations.notification_email.trim() !== '';
}

// Enhanced helper function to get shop domain from various sources
function getShopDomain(req, res) {
  // For public routes, prioritize query parameters
  const shopFromQuery = req.query.shop;
  const shopFromParams = req.params.shop;
  const shopFromBody = req.body?.shop;
  const shopFromHeader = req.headers['x-shopify-shop-domain'];
  const shopFromSession = res.locals?.shopify?.session?.shop;
  
  // For embedded app routes, we might have the shop in the URL
  const shopFromHost = req.query.host ? new URLSearchParams(req.query.host).get('shop') : null;
  
  const shop = shopFromQuery || shopFromParams || shopFromBody || shopFromHost || shopFromHeader || shopFromSession;
  
  console.log('Shop domain resolution:', {
    fromQuery: shopFromQuery,
    fromParams: shopFromParams,
    fromBody: shopFromBody,
    fromHost: shopFromHost,
    fromHeader: shopFromHeader,
    fromSession: shopFromSession,
    final: shop
  });
  
  return shop;
}





// Add debugging middleware
app.use((req, res, next) => {
  console.log('Request URL:', req.url);
  console.log('Request method:', req.method);
  console.log('Query params:', req.query);
  next();
});

// Set up Shopify authentication
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  async (req, res, next) => {
    try {
      // After successful auth, register webhooks and create shop installation record
      const session = res.locals.shopify.session;
      if (session && session.accessToken) {
        console.log('OAuth callback - Shop:', session.shop);
        console.log('OAuth callback - Access token obtained');
        
        // Register webhooks
        await registerWebhooks(session);
        
        // Create shop installation record
        try {
          const shopData = {
            shop_domain: session.shop,
            access_token: session.accessToken,
            scope: session.scope,
            email: session.onlineAccessInfo?.associated_user?.email || null,
            country: session.onlineAccessInfo?.associated_user?.country || null,
            currency: session.onlineAccessInfo?.associated_user?.currency || null,
            timezone: session.onlineAccessInfo?.associated_user?.timezone || null,
            plan_name: session.onlineAccessInfo?.associated_user?.plan_name || null,
            plan_display_name: session.onlineAccessInfo?.associated_user?.plan_display_name || null,
            is_plus: session.onlineAccessInfo?.associated_user?.is_plus || false,
            is_partner_development_store: session.onlineAccessInfo?.associated_user?.is_partner_development_store || false,
            is_shopify_plus: session.onlineAccessInfo?.associated_user?.is_shopify_plus || false
          };
          
          await ShopInstallationsModel.create(shopData);
          console.log('Shop installation record created for:', session.shop);
        } catch (installationError) {
          console.error('Error creating shop installation record:', installationError);
          // Don't fail the OAuth process if installation record creation fails
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


// 2. Update your webhook configuration to use the proper Shopify webhook processor
// This replaces your current webhook processing setup
app.post(
  shopify.config.webhooks.path,
  // This middleware automatically verifies HMAC signatures
  shopify.processWebhooks({
    webhookHandlers: {
      // Customer data redaction (GDPR required)
      CUSTOMERS_REDACT: {
        deliveryMethod: DeliveryMethod.Http,
        callbackUrl: shopify.config.webhooks.path,
        callback: async (topic, shop, body, webhookId) => {
          try {
            const payload = JSON.parse(body);
            console.log('Customer redact request for:', shop, payload.customer.email);
            
            // Delete customer data from your database
            await SubmissionsModel.redactCustomerData(shop, payload.customer.email);
            
            console.log('Customer data redacted successfully');
          } catch (error) {
            console.error('Error processing customer redact:', error);
            throw error;
          }
        }
      },
      
      // Customer data request (GDPR required)
      CUSTOMERS_DATA_REQUEST: {
        deliveryMethod: DeliveryMethod.Http,
        callbackUrl: shopify.config.webhooks.path,
        callback: async (topic, shop, body, webhookId) => {
          try {
            const payload = JSON.parse(body);
            console.log('Customer data request for:', shop, payload.customer.email);
            
            // Get customer data from your database
            const customerData = await SubmissionsModel.getCustomerData(shop, payload.customer.email);
            
            // In production, you would send this data to the customer
            // For now, we'll just log it
            console.log('Customer data retrieved:', customerData);
            
            // TODO: Implement email sending to customer with their data
          } catch (error) {
            console.error('Error processing customer data request:', error);
            throw error;
          }
        }
      },
      
      // Shop data redaction (GDPR required)
      SHOP_REDACT: {
        deliveryMethod: DeliveryMethod.Http,
        callbackUrl: shopify.config.webhooks.path,
        callback: async (topic, shop, body, webhookId) => {
          try {
            console.log('Shop redact request for:', shop);
            
            // Delete all shop data from your database
            await SubmissionsModel.redactShopData(shop);
            await JobsModel.redactShopData(shop);
            await CustomizationsModel.redactShopData(shop);
            await RewardsModel.redactShopData(shop);
            
            console.log('Shop data redacted successfully');
          } catch (error) {
            console.error('Error processing shop redact:', error);
            throw error;
          }
        }
      },
      
      // App uninstalled webhook
      APP_UNINSTALLED: {
        deliveryMethod: DeliveryMethod.Http,
        callbackUrl: shopify.config.webhooks.path,
        callback: async (topic, shop, body, webhookId) => {
          try {
            console.log('App uninstalled for shop:', shop);
            
            // Clean up shop data (but keep submissions for GDPR)
            await CustomizationsModel.redactShopData(shop);
            await JobsModel.redactShopData(shop);
            await RewardsModel.redactShopData(shop);
            
            // Delete shop installation record
            await ShopInstallationsModel.delete(shop);
            console.log('Shop installation record deleted for:', shop);
            
            // Delete sessions for this shop
            const sessions = await sessionStorage.findSessionsByShop(shop);
            if (sessions && sessions.length > 0) {
              for (const session of sessions) {
                await sessionStorage.deleteSession(session.id);
              }
              console.log(`Deleted ${sessions.length} sessions for shop:`, shop);
            }
            
            console.log('Shop data cleaned up successfully for:', shop);
          } catch (error) {
            console.error('Error cleaning up shop data for uninstall:', error);
            throw error;
          }
        }
      }
    }
  })
);

// Rate limiting - more lenient for development
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs (increased from 100)
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please wait before making more requests',
      retryAfter: Math.ceil(15 * 60 / 60) // 15 minutes in minutes
    });
  }
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Middleware
app.use(express.json());
app.use(shopify.cspHeaders());

// Serve static files
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Security headers middleware
app.use((req, res, next) => {
  // Existing ngrok bypass
  res.setHeader('ngrok-skip-browser-warning', 'true');
  
  // Add security headers for better browser trust
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // For embedded Shopify apps, we need to allow iframe embedding
  // Only set X-Frame-Options for non-embedded routes
  if (!req.path.startsWith('/api/auth') && !req.path.startsWith('/')) {
    res.setHeader('X-Frame-Options', 'DENY');
  } else {
    // Allow Shopify admin iframe for embedded app
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "frame-ancestors https://*.myshopify.com https://admin.shopify.com");
  }
  
  next();
});


// Health check endpoint (public)
// Health check endpoint (public) - Updated to use Shopify's decoder
app.get('/api/health/:shop', async (req, res) => {
  try {
    const shop = req.params.shop;
    console.log('Health check for shop:', shop);
    
    // Check for session token in Authorization header
    const authHeader = req.headers.authorization;
    console.log('Authorization header present:', !!authHeader);
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      console.log('Extracted Bearer token (first 20 chars):', token.substring(0, 20) + '...');
      
      let payload = null;
      
      // Try to decode using Shopify's official helpers
      try {
        if (shopify.api?.utils?.decodeSessionToken) {
          payload = shopify.api.utils.decodeSessionToken(token);
          console.log('Successfully decoded session token using shopify.api.utils.decodeSessionToken');
        } else if (shopify.api?.Utils?.decodeSessionToken) {
          payload = shopify.api.Utils.decodeSessionToken(token);
          console.log('Successfully decoded session token using shopify.api.Utils.decodeSessionToken');
        } else if (shopify.api?.Auth?.JWT?.decodeSessionToken) {
          payload = shopify.api.Auth.JWT.decodeSessionToken(token);
          console.log('Successfully decoded session token using shopify.api.Auth.JWT.decodeSessionToken');
        }
        
        if (payload) {
          console.log('Session token payload:', {
            iss: payload.iss,
            dest: payload.dest,
            aud: payload.aud,
            sub: payload.sub,
            exp: payload.exp,
            sid: payload.sid
          });
        }
      } catch (decodeError) {
        console.log('Failed to decode session token:', decodeError.message);
      }
      
      if (payload && (!payload.exp || payload.exp > Math.floor(Date.now() / 1000))) {
        // Valid token
        return res.json({
          shop,
          hasSession: true,
          sessionValid: true,
          needsAuth: false,
          authUrl: null
        });
      }
    }
    
    // Fall back to existing session check logic
    const sessionId = req.query.session;
    console.log('Session ID from request:', sessionId);
    
    let validSession = null;
    
    if (sessionId) {
      // Try to load the specific session
      try {
        validSession = await sessionStorage.loadSession(sessionId);
        console.log('Loaded session by ID:', validSession ? 'Yes' : 'No');
      } catch (error) {
        console.log('Error loading session by ID:', error.message);
      }
    }
    
    // If no session found by ID, try to find by shop
    if (!validSession) {
      const sessions = await sessionStorage.findSessionsByShop(shop);
      console.log('Found sessions by shop:', sessions?.length || 0);
      
      validSession = sessions?.find(s => {
        // If expires is null, the session is valid (no expiration)
        if (!s.expires) {
          console.log('Session with no expiration found:', s.id);
          return true;
        }
        const isValid = new Date(s.expires) > new Date();
        console.log('Session', s.id, 'expires:', s.expires, 'valid:', isValid);
        return isValid;
      });
    }
    
    console.log('Valid session found:', !!validSession);
    
    res.json({
      shop,
      hasSession: !!validSession,
      sessionValid: !!validSession,
      needsAuth: !validSession,
      authUrl: !validSession ? `/api/auth?shop=${shop}` : null
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({ error: 'Health check failed' });
  }
});

// Public routes (no auth required)
app.use('/api/public', publicJobRoutes);

// Public submission form route
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

// Public jobs browsing page
app.get('/jobs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'jobs.html'));
});

// Jobs page for specific shop
app.get('/jobs/:shop', (req, res) => {
  if (!req.params.shop || req.params.shop.trim() === '') {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'jobs.html'));
});

// Apply session validation to all admin routes
app.use('/api/admin', shopify.ensureInstalledOnShop());



// Admin routes (with authentication)
app.use('/api/admin', adminJobRoutes);

// Public API endpoint to get customizations
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

// Public submission endpoint with file upload
app.post('/api/public/submit', upload.single('media'), async (req, res) => {
  try {
    console.log('Received submission:', req.body);
    console.log('File:', req.file);

    // Get shop domain from multiple sources
    let shopDomain = getShopDomain(req, res);

    // If no shop domain from standard sources, try to get it from the job
    if (!shopDomain && req.body.jobId) {
      try {
        const job = await JobsModel.getById(req.body.jobId);
        if (job && job.shop_domain) {
          shopDomain = job.shop_domain;
          console.log('Got shop domain from job:', shopDomain);
        }
      } catch (error) {
        console.error('Error getting job for shop domain:', error);
      }
    }

    if (!shopDomain) {
      return res.status(400).json({
        success: false,
        message: 'Shop domain is required'
      });
    }

    // Validate required fields
    const { customerEmail, type, content } = req.body;
    if (!customerEmail || !type || !content) {
      console.error('Missing required fields:', req.body);
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: customerEmail, type, content'
      });
    }

    // Prevent submissions to full jobs
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

    // Prepare media URL if file was uploaded
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
          console.log('Uploaded to S3:', mediaUrl);
        } catch (error) {
          console.error('S3 upload failed:', error);
          // Fallback to local storage
          const filename = Date.now() + '-' + req.file.originalname;
          const localPath = path.join(uploadsDir, filename);
          fs.writeFileSync(localPath, req.file.buffer);
          mediaUrl = `/uploads/${filename}`;
        }
      } else {
        // Local storage
        const filename = Date.now() + '-' + req.file.originalname;
        const localPath = path.join(uploadsDir, filename);
        fs.writeFileSync(localPath, req.file.buffer);
        mediaUrl = `/uploads/${filename}`;
      }
      console.log('File uploaded:', mediaUrl);
    }

    // Save to database with shop domain
    const submission = await SubmissionsModel.create({
      customerEmail,
      type,
      content,
      mediaUrl,
      status: 'pending',
      jobId: req.body.jobId || null,
      shopDomain: shopDomain // Make sure your model supports this
    });

    console.log('Saved submission:', submission);

    // Get job details if jobId is provided
    let jobName = 'General Submission';
    let job = null;
    if (req.body.jobId) {
      try {
        job = await JobsModel.getById(req.body.jobId);
        if (job) {
          jobName = job.title;
        }
      } catch (error) {
        console.error('Error getting job details:', error);
      }
    }

    console.log('🔍 Shop domain for customizations:', shopDomain);

    // Get customizations for email content
    const customizations = await CustomizationsModel.getByShop(shopDomain) || {};
    console.log('🎨 Loaded customizations:', customizations);

    // Check if email setup is complete
    if (!isEmailSetupComplete(customizations)) {
      return res.status(503).json({
        success: false,
        message: 'This store is not yet configured to accept submissions. The store administrator needs to configure email settings in the app dashboard before submissions can be accepted.'
      });
    }

    // Get notification email address
    const notificationEmailTo = customizations.notification_email;
    if (!notificationEmailTo) {
      console.error('No notification email configured for shop:', shopDomain);
      return res.status(500).json({
        success: false,
        message: 'Email settings not configured. Please configure email settings in the admin dashboard.'
      });
    }

    const appUrl = shopDomain ? `https://${shopDomain}/admin/apps/${process.env.SHOPIFY_API_KEY}` : null;

    // Send notification email to admin
    await sendNotificationEmail({
      to: notificationEmailTo,
      subject: 'New UGC Submission Received',
      text: `A new submission was received from ${customerEmail}.\nJob: ${jobName}\nType: ${type}\n\nView in app: ${appUrl}`,
      html: `<p>A new submission was received from <b>${customerEmail}</b>.</p><p><strong>Job:</strong> ${jobName}</p><p><strong>Type:</strong> ${type}</p><p><br><a href="${appUrl}" style="background: #008060; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View in App</a></p>`
    });

    // Send confirmation email to customer
    await sendCustomerConfirmationEmail({
      to: customerEmail,
      customerName: customerEmail,
      type,
      customSubject: customizations.email_subject_confirmation,
      customBody: customizations.email_body_confirmation,
      customizations
    });

    res.json({
      success: true,
      message: 'Submission received!',
      submissionId: submission.id
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

// Admin API endpoints

// Get submissions
app.get('/api/admin/submissions', async (req, res) => {
  try {
    // Check if Shopify middleware set the session
    if (!res.locals?.shopify?.session) {
      console.log('No session from Shopify middleware, trying to handle manually');
      
      // For embedded apps, try to get session from id_token or session parameter
      const idToken = req.query.id_token;
      const sessionId = req.query.session;
      const shop = req.query.shop;
      
      if (!shop) {
        console.log('No shop found in query params');
        return res.status(401).json({ error: 'Unauthorized - No shop parameter' });
      }
      
      // Try to get session from sessionStorage
      let session = null;
      if (sessionId) {
        try {
          session = await sessionStorage.loadSession(sessionId);
          console.log('Loaded session from sessionId:', session ? 'Yes' : 'No');
        } catch (error) {
          console.log('Failed to load session from sessionId:', error.message);
        }
      }
      
      // If no session found, try to create one from the shop
      if (!session) {
        console.log('Creating offline session for shop:', shop);
        session = {
          id: `offline_${shop}`,
          shop: shop,
          state: 'offline',
          isOnline: false
        };
      }
      
      // Set the session in res.locals for consistency
      res.locals.shopify = { session };
    }
    
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    const submissions = await SubmissionsModel.getByShop(shop);
    
    const transformedSubmissions = submissions.map(sub => ({
      id: sub.id,
      customerEmail: sub.customer_email,
      type: sub.type,
      content: sub.content,
      status: sub.status,
      mediaUrl: sub.media_url,
      createdAt: sub.created_at,
      job_title: sub.job_title,
      job_id: sub.job_id,
      reward_type: sub.reward_type || null,
      reward_fulfilled: sub.reward_fulfilled || false
    }));
    
    res.json({ submissions: transformedSubmissions });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Approve submission
app.post('/api/admin/submissions/:id/approve', async (req, res) => {
  try {
    const submissionId = req.params.id;
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    // Fetch submission
    const submission = await SubmissionsModel.getById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    // Validate ownership
    if (submission.job_id) {
      const job = await JobsModel.getById(submission.job_id);
      if (!job || job.shop_domain !== shop) {
        return res.status(403).json({ error: 'Unauthorized to approve this submission' });
      }
    }

    let job = null;
    let approvalSuccessful = false;
    let rewardSentSuccessfully = false;
    let errorMessage = null;

    // Handle job-related rewards
    if (submission.job_id) {
      job = await JobsModel.getById(submission.job_id);
      console.log('Job details:', job);

      // Handle automatic discount rewards
      if (['percentage', 'fixed'].includes(job.reward_type)) {
        console.log('Creating discount code for job:', job.id);

        try {
          const client = new shopify.api.clients.Graphql({ session });
          const discountService = new ShopifyDiscountService(client);

          const { code } = await discountService.createDiscountCode(job, submission);
          console.log(`Discount code created: ${code}`);

          const customizations = await CustomizationsModel.getByShop(shop) || {};
          
          await sendRewardCodeEmail({
            to: submission.customer_email,
            code,
            value: job.reward_value,
            type: job.reward_type,
            expiresIn: '30 days',
            customSubject: customizations.email_subject_reward,
            customBody: customizations.email_body_reward,
            customizations
          });

          const reward = await RewardsModel.getBySubmissionId(submission.id);
          if (reward) {
            await RewardsModel.markAsSent(reward.id);
            await RewardsModel.updateSubmissionRewardStatus(submission.id);
          }

          console.log(`Reward sent to ${submission.customer_email}: ${code}`);
          rewardSentSuccessfully = true;
        } catch (err) {
          console.error('Error creating/sending reward:', err);
          errorMessage = 'Failed to create or send discount code. The submission remains pending.';
          
          // Create pending reward for manual fulfillment
          await RewardsModel.create({
            submissionId: submission.id,
            jobId: job.id,
            type: job.reward_type,
            code: null,
            value: job.reward_value,
            status: 'pending_fulfillment',
            expiresAt: null,
            sentAt: null
          });
          
          console.log('Created pending reward record for manual fulfillment');
        }
      }

      // Handle gift card rewards
      else if (job.reward_type === 'giftcard') {
        console.log('Processing gift card reward for job:', job.id);
        
        try {
          await RewardsModel.create({
            submissionId: submission.id,
            jobId: job.id,
            type: 'giftcard',
            code: null,
            value: job.reward_giftcard_amount,
            status: 'pending_fulfillment',
            expiresAt: null,
            shopifyPriceRuleId: null,
            shopifyDiscountCodeId: null
          });
          
          const customizations = await CustomizationsModel.getByShop(shop) || {};
          const notificationEmailTo = customizations.notification_email;
          
          if (notificationEmailTo) {
            await sendNotificationEmail({
              to: notificationEmailTo,
              subject: 'Manual Gift Card Required - Honest UGC',
              html: `
                <h2>Gift Card Needs to be Created</h2>
                <p>A gift card needs to be manually created for an approved UGC submission:</p>
                <ul>
                  <li><strong>Customer:</strong> ${submission.customer_email}</li>
                  <li><strong>Amount:</strong> $${job.reward_giftcard_amount}</li>
                  <li><strong>Job:</strong> ${job.title}</li>
                  <li><strong>Submission ID:</strong> ${submission.id}</li>
                </ul>
                <p><strong>Action Required:</strong></p>
                <ol>
                  <li>Go to Shopify Admin > Products > Gift cards</li>
                  <li>Create a new gift card for $${job.reward_giftcard_amount}</li>
                  <li>Return to Honest UGC and click "Send Gift Card Email" on this submission</li>
                </ol>
              `
            });
          }
          
          console.log(`Gift card reward pending for ${submission.customer_email}: $${job.reward_giftcard_amount}`);
          rewardSentSuccessfully = true; // Gift cards are manual, so we consider this successful
        } catch (error) {
          console.error('Error processing gift card reward:', error);
          errorMessage = 'Failed to process gift card reward. The submission remains pending.';
        }
      }

      // Handle free product rewards
      else if (job.reward_type === 'product') {
        console.log('Processing free product reward for job:', job.id);
        
        try {
          const client = new shopify.api.clients.Graphql({ session });
          const discountService = new ShopifyDiscountService(client);
          
          const { code } = await discountService.createProductDiscountCode(job, submission);
          console.log(`Free product discount code created: ${code}`);

          const customizations = await CustomizationsModel.getByShop(shop) || {};

          await sendFreeProductEmail({
            to: submission.customer_email,
            code: code,
            productName: job.reward_product,
            customSubject: customizations.email_subject_product,
            customBody: customizations.email_body_product,
            customizations
          });

          const reward = await RewardsModel.getBySubmissionId(submission.id);
          if (reward) {
            await RewardsModel.markAsSent(reward.id);
            await RewardsModel.updateSubmissionRewardStatus(submission.id);
          }
          
          console.log(`Free product code sent to ${submission.customer_email}: ${code}`);
          rewardSentSuccessfully = true;
        } catch (error) {
          console.error('Error creating free product reward:', error);
          errorMessage = 'Failed to create or send free product code. The submission remains pending.';
          
          await RewardsModel.create({
            submissionId: submission.id,
            jobId: job.id,
            type: 'product',
            code: null,
            value: 0,
            status: 'pending_fulfillment',
            expiresAt: null,
            sentAt: null
          });
          
          console.log('Created pending reward record for manual fulfillment');
        }
      }
      // No reward type
      else {
        rewardSentSuccessfully = true; // No reward to send
      }

      // Only update submission status and increment spots if reward was handled successfully
      if (rewardSentSuccessfully) {
        await SubmissionsModel.updateStatus(submissionId, 'approved');
        await JobsModel.incrementSpotsFilled(submission.job_id);
        
        // Check if job should be marked as completed
        const updatedJob = await JobsModel.getById(submission.job_id);
        if (updatedJob.spots_filled >= updatedJob.spots_available) {
          await JobsModel.updateStatus(updatedJob.id, 'completed');
        }
        
        approvalSuccessful = true;
        console.log(`Approved submission ${submissionId}`);
      }
    } else {
      // No job associated - just approve
      await SubmissionsModel.updateStatus(submissionId, 'approved');
      approvalSuccessful = true;
    }

    if (approvalSuccessful) {
      res.json({ success: true, message: 'Submission approved successfully' });
    } else {
      res.status(500).json({ 
        success: false, 
        message: errorMessage || 'Failed to approve submission due to reward processing error',
        keepPending: true 
      });
    }
  } catch (error) {
    console.error('Error approving submission:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to approve submission',
      error: error.message 
    });
  }
});

// Reject submission
app.post('/api/admin/submissions/:id/reject', async (req, res) => {
  try {
    const submissionId = req.params.id;
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    const submission = await SubmissionsModel.getById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    // Validate ownership
    if (submission.job_id) {
      const job = await JobsModel.getById(submission.job_id);
      if (!job || job.shop_domain !== shop) {
        return res.status(403).json({ error: 'Unauthorized to reject this submission' });
      }
    }
    
    // Handle job spot adjustment
    if (submission.status === 'approved' && submission.job_id) {
      await JobsModel.decrementSpotsFilled(submission.job_id);
      
      const job = await JobsModel.getById(submission.job_id);
      if (job && job.status === 'completed' && job.spots_filled < job.spots_available) {
        await JobsModel.updateStatus(submission.job_id, 'active');
      }
    }
    
    await SubmissionsModel.updateStatus(submissionId, 'rejected');
    console.log('Rejected submission ' + submissionId);

    const customizations = await CustomizationsModel.getByShop(shop) || {};
    
    await sendCustomerStatusEmail({
      to: submission.customer_email,
      status: 'rejected',
      type: submission.type,
      customSubject: customizations.email_subject_rejected,
      customBody: customizations.email_body_rejected,
      customizations
    });
    
    res.json({ success: true, message: 'Submission rejected' });
  } catch (error) {
    console.error('Error rejecting submission:', error);
    res.status(500).json({ success: false, message: 'Failed to reject submission' });
  }
});

// Send gift card email
app.post('/api/admin/rewards/:submissionId/send-giftcard', async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { giftCardCode, amount } = req.body;
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    const submission = await SubmissionsModel.getById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Validate ownership
    if (submission.job_id) {
      const job = await JobsModel.getById(submission.job_id);
      if (!job || job.shop_domain !== shop) {
        return res.status(403).json({ error: 'Unauthorized to access this submission' });
      }
    }
    
    const customizations = await CustomizationsModel.getByShop(shop) || {};
    
    await sendGiftCardEmail({
      to: submission.customer_email,
      code: giftCardCode,
      amount: amount,
      customSubject: customizations.email_subject_giftcard,
      customBody: customizations.email_body_giftcard,
      customizations
    });
    
    const reward = await RewardsModel.getBySubmissionId(submissionId);
    if (reward) {
      await RewardsModel.update(reward.id, {
        code: giftCardCode,
        status: 'fulfilled',
        fulfilled_at: new Date()
      });
    }
    
    await SubmissionsModel.update(submissionId, {
      reward_fulfilled: true,
      reward_fulfilled_at: new Date()
    });
    
    res.json({ success: true, message: 'Gift card email sent successfully' });
  } catch (error) {
    console.error('Error sending gift card email:', error);
    res.status(500).json({ error: 'Failed to send gift card email' });
  }
});

// Resend rejection email
app.post('/api/admin/submissions/:id/resend-rejection', async (req, res) => {
  try {
    const submissionId = req.params.id;
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    const submission = await SubmissionsModel.getById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Validate ownership
    if (submission.job_id) {
      const job = await JobsModel.getById(submission.job_id);
      if (!job || job.shop_domain !== shop) {
        return res.status(403).json({ error: 'Unauthorized to access this submission' });
      }
    }

    // Check if submission is rejected
    if (submission.status !== 'rejected') {
      return res.status(400).json({ error: 'Can only resend rejection emails for rejected submissions' });
    }
    
    const customizations = await CustomizationsModel.getByShop(shop) || {};
    
    await sendCustomerStatusEmail({
      to: submission.customer_email,
      status: 'rejected',
      type: submission.type,
      customSubject: customizations.email_subject_rejected,
      customBody: customizations.email_body_rejected,
      customizations
    });
    
    res.json({ success: true, message: 'Rejection email resent successfully' });
  } catch (error) {
    console.error('Error resending rejection email:', error);
    res.status(500).json({ error: 'Failed to resend rejection email' });
  }
});

// Resend reward email
app.post('/api/admin/submissions/:id/resend-reward', async (req, res) => {
  try {
    console.log('=== Resend Reward Email Endpoint Called ===');
    const submissionId = req.params.id;
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    console.log('Parameters:', { submissionId, shop });
    
    const submission = await SubmissionsModel.getById(submissionId);
    if (!submission) {
      console.log('Submission not found:', submissionId);
      return res.status(404).json({ error: 'Submission not found' });
    }

    console.log('Found submission:', submission);

    // Validate ownership
    if (submission.job_id) {
      const job = await JobsModel.getById(submission.job_id);
      if (!job || job.shop_domain !== shop) {
        console.log('Unauthorized access attempt:', { jobShop: job?.shop_domain, requestShop: shop });
        return res.status(403).json({ error: 'Unauthorized to access this submission' });
      }
    }

    // Check if submission is approved
    if (submission.status !== 'approved') {
      console.log('Submission not approved:', submission.status);
      return res.status(400).json({ error: 'Can only resend reward emails for approved submissions' });
    }

    // Get the job details for reward information
    if (!submission.job_id) {
      console.log('No job associated with submission');
      return res.status(400).json({ error: 'No job associated with this submission' });
    }

    const job = await JobsModel.getById(submission.job_id);
    if (!job) {
      console.log('Job not found:', submission.job_id);
      return res.status(404).json({ error: 'Job not found' });
    }

    console.log('Found job:', job);

    const customizations = await CustomizationsModel.getByShop(shop) || {};
    console.log('Customizations loaded:', !!customizations);

    // Handle different reward types
    if (job.reward_type === 'percentage' || job.reward_type === 'fixed') {
      console.log('Processing percentage/fixed reward type');
      
      // Get existing reward record
      const reward = await RewardsModel.getBySubmissionId(submission.id);
      if (!reward || !reward.code) {
        console.log('No reward code found for submission:', submission.id);
        return res.status(400).json({ error: 'No discount code found for this submission. The reward may need to be created first.' });
      }

      console.log('Found reward record:', reward);

      console.log('Calling sendRewardCodeEmail with:', {
        to: submission.customer_email,
        code: reward.code,
        value: job.reward_value,
        type: job.reward_type,
        expiresIn: '30 days',
        customSubject: customizations.email_subject_reward,
        customBody: customizations.email_body_reward
      });

      await sendRewardCodeEmail({
        to: submission.customer_email,
        code: reward.code,
        value: job.reward_value,
        type: job.reward_type,
        expiresIn: '30 days',
        customSubject: customizations.email_subject_reward,
        customBody: customizations.email_body_reward,
        customizations
      });
      
      console.log('✅ Reward code email sent successfully');
      
    } else if (job.reward_type === 'product') {
      console.log('Processing product reward type');
      
      // Get existing reward record
      const reward = await RewardsModel.getBySubmissionId(submission.id);
      if (!reward || !reward.code) {
        console.log('No product reward code found for submission:', submission.id);
        return res.status(400).json({ error: 'No product discount code found for this submission. The reward may need to be created first.' });
      }

      console.log('Found product reward record:', reward);

      console.log('Calling sendFreeProductEmail with:', {
        to: submission.customer_email,
        code: reward.code,
        productName: job.reward_product,
        customSubject: customizations.email_subject_product,
        customBody: customizations.email_body_product
      });

      await sendFreeProductEmail({
        to: submission.customer_email,
        code: reward.code,
        productName: job.reward_product,
        customSubject: customizations.email_subject_product,
        customBody: customizations.email_body_product,
        customizations
      });
      
      console.log('✅ Free product email sent successfully');
      
    } else if (job.reward_type === 'giftcard') {
      console.log('Gift card reward type - redirecting to gift card endpoint');
      return res.status(400).json({ error: 'Please use the "Send Gift Card Email" button to resend gift card emails' });
    }
    
    console.log('✅ Reward email resent successfully');
    res.json({ success: true, message: 'Reward email resent successfully' });
  } catch (error) {
    console.error('❌ Error resending reward email:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to resend reward email: ' + error.message });
  }
});

// Get customizations
app.get('/api/admin/customizations', async (req, res) => {
  try {
    // Check if Shopify middleware set the session
    if (!res.locals?.shopify?.session) {
      console.log('No session from Shopify middleware, trying to handle manually');
      
      // For embedded apps, try to get session from id_token or session parameter
      const idToken = req.query.id_token;
      const sessionId = req.query.session;
      const shop = req.query.shop;
      
      if (!shop) {
        console.log('No shop found in query params');
        return res.status(401).json({ error: 'Unauthorized - No shop parameter' });
      }
      
      // Try to get session from sessionStorage
      let session = null;
      if (sessionId) {
        try {
          session = await sessionStorage.loadSession(sessionId);
          console.log('Loaded session from sessionId:', session ? 'Yes' : 'No');
        } catch (error) {
          console.log('Failed to load session from sessionId:', error.message);
        }
      }
      
      // If no session found, try to create one from the shop
      if (!session) {
        console.log('Creating offline session for shop:', shop);
        session = {
          id: `offline_${shop}`,
          shop: shop,
          state: 'offline',
          isOnline: false
        };
      }
      
      // Set the session in res.locals for consistency
      res.locals.shopify = { session };
    }
    
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    // Add cache control headers to prevent caching issues
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const customizations = await CustomizationsModel.getByShop(shop);
    console.log('GET customizations - Found:', customizations ? 'Yes' : 'No');
    
    res.json(customizations || {});
  } catch (error) {
    console.error('Error loading customizations:', error);
    res.status(500).json({ error: 'Failed to load customizations' });
  }
});

// Save customizations
app.post('/api/admin/customizations', async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const shop = session.shop;
    console.log('POST customizations - Shop:', shop);
    console.log('POST customizations - Body:', req.body);
    
    const customizations = await CustomizationsModel.upsert(shop, req.body);
    console.log('POST customizations - Saved successfully');
    
    res.json({ success: true, customizations });
  } catch (error) {
    console.error('Error saving customizations:', error);
    res.status(500).json({ error: 'Failed to save customizations' });
  }
});

// Save email settings
app.post('/api/admin/email-settings', async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const shop = session.shop;
    console.log('Saving email settings - Shop:', shop);
    console.log('Email settings body:', req.body);
    
    // Get existing customizations and merge with email settings
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
    console.log('Saved email settings:', customizations);
    
    res.json({ success: true, customizations });
  } catch (error) {
    console.error('Error saving email settings:', error);
    res.status(500).json({ error: 'Failed to save email settings' });
  }
});

// Add these routes to your index.js file

app.get('/privacy', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Privacy Policy - Honest UGC</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            line-height: 1.6;
            color: #333;
          }
          h1, h2 { color: #202223; }
        </style>
      </head>
      <body>
        <h1>Privacy Policy</h1>
        <p>Last updated: ${new Date().toLocaleDateString()}</p>
        
        <h2>Information We Collect</h2>
        <p>Honest UGC collects information necessary to provide our services:</p>
        <ul>
          <li>Store information from Shopify (store name, email)</li>
          <li>Customer submissions (email, content, media files)</li>
          <li>Usage data to improve our services</li>
        </ul>
        
        <h2>How We Use Information</h2>
        <p>We use collected information to:</p>
        <ul>
          <li>Process and manage UGC submissions</li>
          <li>Send reward emails to customers</li>
          <li>Provide customer support</li>
          <li>Improve our services</li>
        </ul>
        
        <h2>Data Security</h2>
        <p>We implement appropriate security measures to protect your data. All data is transmitted over secure HTTPS connections.</p>
        
        <h2>Contact Us</h2>
        <p>If you have questions about this privacy policy, please contact us through your Shopify admin.</p>
      </body>
    </html>
  `);
});

app.get('/terms', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Terms of Service - Honest UGC</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            line-height: 1.6;
            color: #333;
          }
          h1, h2 { color: #202223; }
        </style>
      </head>
      <body>
        <h1>Terms of Service</h1>
        <p>Last updated: ${new Date().toLocaleDateString()}</p>
        
        <h2>Acceptance of Terms</h2>
        <p>By using Honest UGC, you agree to these terms of service.</p>
        
        <h2>Description of Service</h2>
        <p>Honest UGC is a Shopify app that helps stores collect and manage user-generated content with automated rewards.</p>
        
        <h2>User Responsibilities</h2>
        <ul>
          <li>Provide accurate information</li>
          <li>Comply with all applicable laws</li>
          <li>Respect intellectual property rights</li>
          <li>Not use the service for deceptive or harmful purposes</li>
        </ul>
        
        <h2>Limitation of Liability</h2>
        <p>Honest UGC is provided "as is" without warranties. We are not liable for any damages arising from use of our service.</p>
        
        <h2>Contact</h2>
        <p>For questions about these terms, contact us through your Shopify admin.</p>
      </body>
    </html>
  `);
});

// Add this route to your index.js

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

// Root route - Admin dashboard
// Replace your current root route with this updated version that handles direct access

app.get('/', async (req, res) => {
  console.log('=== ROOT ROUTE CALLED ===');
  
  try {
    const shop = getShopDomain(req, res);
    
    // If no shop parameter, show a landing page
    if (!shop) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Honest UGC - User Generated Content Platform</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="description" content="Honest UGC helps Shopify stores collect and manage user-generated content with rewards.">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 0;
                padding: 0;
                background: #f8f9fa;
              }
              .container {
                max-width: 800px;
                margin: 0 auto;
                padding: 60px 20px;
                text-align: center;
              }
              h1 {
                color: #202223;
                font-size: 48px;
                margin-bottom: 20px;
              }
              p {
                color: #616161;
                font-size: 20px;
                line-height: 1.5;
                margin-bottom: 40px;
              }
              .features {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 30px;
                margin: 60px 0;
              }
              .feature {
                background: white;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .feature h3 {
                color: #202223;
                margin-bottom: 10px;
              }
              .cta {
                background: #008060;
                color: white;
                padding: 16px 32px;
                text-decoration: none;
                border-radius: 4px;
                display: inline-block;
                font-size: 18px;
                margin-top: 30px;
              }
              .cta:hover {
                background: #006e52;
              }
              .shopify-section {
                margin-top: 60px;
                padding: 40px;
                background: white;
                border-radius: 8px;
              }
              .install-form {
                margin-top: 20px;
              }
              .install-form input {
                padding: 12px;
                font-size: 16px;
                border: 1px solid #ddd;
                border-radius: 4px;
                width: 300px;
                margin-right: 10px;
              }
              .install-form button {
                padding: 12px 24px;
                font-size: 16px;
                background: #008060;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
              }
              .install-form button:hover {
                background: #006e52;
              }
              footer {
                margin-top: 80px;
                padding: 40px 0;
                border-top: 1px solid #e1e1e1;
              }
              .footer-links {
                display: flex;
                justify-content: center;
                gap: 30px;
                margin-bottom: 20px;
              }
              .footer-links a {
                color: #616161;
                text-decoration: none;
                font-size: 14px;
              }
              .footer-links a:hover {
                color: #202223;
              }
              .copyright {
                text-align: center;
                color: #999;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Honest UGC</h1>
              <p>Collect authentic user-generated content from your customers with automated rewards</p>
              
              <div class="features">
                <div class="feature">
                  <h3>📸 Collect Content</h3>
                  <p>Let customers submit photos and videos of your products in action</p>
                </div>
                <div class="feature">
                  <h3>🎁 Automated Rewards</h3>
                  <p>Automatically send discount codes, gift cards, or free products</p>
                </div>
                <div class="feature">
                  <h3>💼 Easy Management</h3>
                  <p>Review and approve submissions from your Shopify admin</p>
                </div>
              </div>
              
              <div class="shopify-section">
                <h2>For Shopify Store Owners</h2>
                <p>Install Honest UGC in your Shopify store to start collecting user-generated content</p>
                
                <div class="install-form">
                  <form action="/install" method="get">
                    <input type="text" name="shop" placeholder="your-store.myshopify.com" required pattern="[a-zA-Z0-9-]+\\.myshopify\\.com">
                    <button type="submit">Install App</button>
                  </form>
                </div>
                
                <p style="margin-top: 30px; font-size: 14px; color: #616161;">
                  Already installed? Access the app from your Shopify admin.
                </p>
              </div>
              
              <footer>
                <div class="footer-links">
                  <a href="/privacy">Privacy Policy</a>
                  <a href="/terms">Terms of Service</a>
                </div>
                <div class="copyright">
                  © ${new Date().getFullYear()} Honest UGC. All rights reserved.
                </div>
              </footer>
            </div>
          </body>
        </html>
      `);
    }
    
    // If shop parameter exists, check for session
    const session = res.locals?.shopify?.session;
    
    if (!session || !session.accessToken) {
      // Check if we have a stored session
      const sessions = await sessionStorage.findSessionsByShop(shop);
      const validSession = sessions?.find(s => !s.expires || new Date(s.expires) > new Date());
      
      if (!validSession) {
        console.log('No valid session found, redirecting to auth');
        return res.redirect(`/api/auth?shop=${shop}`);
      }
      
      // Attach the session
      res.locals = res.locals || {};
      res.locals.shopify = { session: validSession };
    }
    
    // Render the admin dashboard
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
      env: process.env
    });
  } catch (error) {
    console.error('Error in root route:', error);
    res.status(500).send('An error occurred. Please try again.');
  }
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