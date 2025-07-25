// 0️⃣ Load .env first so process.env is populated
import dotenv from 'dotenv';
dotenv.config();

// 1️⃣ Import Shopify API v9 adapter
import '@shopify/shopify-api/adapters/node';

// 2️⃣ Import Shopify API v9
import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';

// 3️⃣ Initialize your single Shopify client
const Shopify = shopifyApi({
  apiKey:       process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes:       ['write_discounts', 'read_customers', 'write_price_rules'],
  hostName:     process.env.HOST.replace(/^https?:\/\//, ''),
  apiVersion:   LATEST_API_VERSION,
  isEmbeddedApp:true,
});

// 4️⃣ Everything else comes after
import express from 'express';
import { shopifyApp } from '@shopify/shopify-app-express';
import { SQLiteSessionStorage } from '@shopify/shopify-app-session-storage-sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
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


// …then your __dirname, multer setup, shopifyApp() call, routes, etc…

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
const sessionStorage = new SQLiteSessionStorage(
  path.join(__dirname, '../database/session.db')
);

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

// Add this helper function after creating the app
function getShopDomain(req, res) {
  // Check if we have shopify session data
  const shopFromSession = res.locals?.shopify?.session?.shop;
  const shopFromQuery = req.query.shop;
  const shopFromHeader = req.headers['x-shopify-shop-domain'];
  
  // For embedded app routes, we might have the shop in the URL
  const shopFromHost = req.query.host ? new URLSearchParams(req.query.host).get('shop') : null;
  
  const shop = shopFromSession || shopFromQuery || shopFromHost || shopFromHeader;
  
  console.log('Shop domain resolution:', {
    fromSession: shopFromSession,
    fromQuery: shopFromQuery,
    fromHost: shopFromHost,
    fromHeader: shopFromHeader,
    final: shop
  });
  
  return shop;
}

// Add ngrok bypass header
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// Add debugging middleware
app.use((req, res, next) => {
  console.log('Request URL:', req.url);
  console.log('Request method:', req.method);
  console.log('Shopify session:', res.locals.shopify?.session);
  console.log('Query params:', req.query);
  next();
});

// Set up Shopify authentication
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);

// Webhook processing
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: {} })
);

// Middleware
app.use(express.json());
app.use(shopify.cspHeaders());

// Serve static files
app.use('/public', express.static(path.join(__dirname, 'public')));
// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Public routes
app.use('/api/public', publicJobRoutes);

// Admin routes
app.use('/api/admin', adminJobRoutes);

// Route to show submission form
app.get('/submit', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'submit.html'));
});

// Route to show jobs browsing page
app.get('/jobs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'jobs.html'));
});

// Root route - Admin dashboard with jobs functionality
app.get('/', async (req, res) => {
  const submitLink = `${process.env.HOST}/jobs`;
  
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>UGC Rewards Admin</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://unpkg.com/@shopify/app-bridge@3"></script>
        <script>
          // Define global functions immediately in head section
          console.log('Setting up global functions in head...');
          
          function saveEmailSettings() {
            console.log('saveEmailSettings function called');
            
            const form = document.getElementById('emailSettingsForm');
            const formData = new FormData(form);
            const emailSettings = Object.fromEntries(formData);
            
            console.log('Saving email settings:', emailSettings);
            console.log('Current URL params:', window.location.search);
            
            fetch('/api/admin/email-settings' + window.location.search, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(emailSettings),
              credentials: 'include'
            })
            .then(response => {
              console.log('Response status:', response.status);
              
              if (response.ok) {
                console.log('Email settings saved successfully!');
                document.getElementById('emailSettingsSuccessMessage').style.display = 'block';
                setTimeout(() => {
                  document.getElementById('emailSettingsSuccessMessage').style.display = 'none';
                }, 3000);
              } else {
                return response.json().then(errorData => {
                  console.error('Server error:', errorData);
                  alert('Failed to save email settings: ' + (errorData.error || 'Unknown error'));
                });
              }
            })
            .catch(error => {
              console.error('Error saving email settings:', error);
              alert('Error saving email settings');
            });
          }
          
          function resetEmailSettingsToDefaults() {
            console.log('Resetting email settings to defaults');
            
            // Reset all email subject and body fields to their default values
            document.getElementById('emailSubjectConfirmation').value = '';
            document.getElementById('emailBodyConfirmation').value = '';
      
      
            document.getElementById('emailSubjectRejected').value = '';
            document.getElementById('emailBodyRejected').value = '';
            document.getElementById('emailSubjectReward').value = '';
            document.getElementById('emailBodyReward').value = '';
            document.getElementById('emailSubjectGiftcard').value = '';
            document.getElementById('emailBodyGiftcard').value = '';
            document.getElementById('emailSubjectProduct').value = '';
            document.getElementById('emailBodyProduct').value = '';
            document.getElementById('emailFromName').value = '';
            document.getElementById('emailReplyTo').value = '';
            document.getElementById('fromNamePreview').textContent = 'UGC Rewards';
            document.getElementById('replyToPreview').textContent = 'no replies (emails will be no-reply)';
            
            console.log('Email settings reset to defaults');
          }
          
          console.log('Global functions defined successfully in head');
        </script>
        <style>
          *, *::before, *::after {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f6f6f7;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
          }
          .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            border-bottom: 2px solid #e1e3e5;
          }
          .tab {
            padding: 10px 20px;
            background: none;
            border: none;
            border-bottom: 3px solid transparent;
            cursor: pointer;
            font-size: 16px;
            font-weight: 500;
            color: #616161;
            transition: all 0.2s;
          }
          .requirements-list {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          .requirement-item {
            display: flex;
            gap: 10px;
            margin-bottom: 10px;
            align-items: center;
          }
          .requirement-item input {
            flex: 1;
          }
          .btn-remove {
            background: #dc3545;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
          }
          .btn-remove:hover {
            background: #c82333;
          }
          .btn-add {
            background: #28a745;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-top: 10px;
          }
          .btn-add:hover {
            background: #218838;
          }
          .tab:hover {
            color: #202223;
          }
          .tab.active {
            color: #008060;
            border-bottom-color: #008060;
          }
          .filter-btn {
            background: #f6f6f7;
            color: #202223;
            border: 1px solid #c9cccf;
          }
          .filter-btn.active {
            background: #008060;
            color: white;
            border-color: #008060;
          }
          .tab-content {
            display: none;
          }
          .tab-content.active {
            display: block;
          }
          .card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 0 0 1px rgba(63,63,68,.05), 0 1px 3px 0 rgba(63,63,68,.15);
          }
          h1 {
            margin: 0 0 20px 0;
            font-size: 20px;
            font-weight: 600;
          }
          h2 {
            margin: 0 0 15px 0;
            font-size: 18px;
            font-weight: 600;
          }
          .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
          }
          .stat {
            text-align: center;
            padding: 15px;
            background: #f9fafb;
            border-radius: 6px;
          }
          .stat-value {
            font-size: 24px;
            font-weight: 600;
            color: #202223;
          }
          .stat-label {
            font-size: 13px;
            color: #616161;
            margin-top: 5px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #e1e3e5;
            font-weight: 600;
            font-size: 13px;
            color: #202223;
          }
          td {
            padding: 12px;
            border-bottom: 1px solid #e1e3e5;
            font-size: 14px;
            vertical-align: top;
            word-break: break-word;
          }
          .col-date { width: 100px; }
          .col-customer { width: 200px; }
          .col-type { width: 80px; }
          .col-job { width: 75px; }
          
          /* Customizations Tab Styles */
          .color-input-wrapper {
            display: flex;
            gap: 10px;
            align-items: center;
          }
          .color-input-wrapper input[type="color"] {
            width: 60px;
            height: 40px;
            padding: 4px;
            cursor: pointer;
          }
          .color-input-wrapper input[type="text"] {
            flex: 1;
          }
          .help-text {
            font-size: 13px;
            color: #616161;
            margin-top: 5px;
          }
          .checkbox-group {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .checkbox-group input[type="checkbox"] {
            width: auto;
            margin: 0;
          }
          .success-message {
            background: #e3f1df;
            color: #4b5943;
            padding: 12px 16px;
            border-radius: 4px;
            margin-bottom: 20px;
            display: none;
          }
          .image-preview {
            margin-top: 10px;
          }
          .image-preview img {
            max-width: 200px;
            max-height: 100px;
            border: 1px solid #e1e3e5;
            border-radius: 4px;
          }
          .preview-section {
            margin-top: 30px;
            padding: 20px;
            background: #f9fafb;
            border-radius: 6px;
          }
          .preview-iframe {
            width: 100%;
            height: 600px;
            border: 1px solid #e1e3e5;
            border-radius: 4px;
            background: white;
          }
          
          /* Email Settings Tab Styles */
          .email-section {
            margin-bottom: 40px;
            padding: 25px;
            background: #f9fafb;
            border-radius: 8px;
            border: 1px solid #e1e3e5;
          }
          .email-section h3 {
            margin: 0 0 20px 0;
            color: #333;
            font-size: 18px;
            font-weight: 600;
          }
          .email-section .form-group {
            margin-bottom: 20px;
          }
          .email-section label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #333;
          }
          .email-section input[type="text"],
          .email-section textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e1e3e5;
            border-radius: 6px;
            font-size: 14px;
            font-family: inherit;
            transition: border-color 0.2s;
          }
          .email-section input[type="text"]:focus,
          .email-section textarea:focus {
            outline: none;
            border-color: #008060;
            box-shadow: 0 0 0 3px rgba(0, 128, 96, 0.1);
          }
          .email-section textarea {
            resize: vertical;
            min-height: 100px;
          }
          .email-section small {
            display: block;
            margin-top: 8px;
            font-size: 12px;
            color: #666;
            line-height: 1.4;
          }
          .col-content { width: 300px; }
          .col-media { width: 120px; }
          .col-actions { width: 120px; }
          
          .job-title {
            max-width: 70px;
            word-wrap: break-word;
            word-break: break-word;
            white-space: normal;
            line-height: 1.2;
            font-size: 13px;
          }
          .review-content {
            white-space: pre-line;
            word-break: break-word;
            max-width: 280px;
            max-height: 60px;
            overflow: hidden;
          }
          .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #616161;
          }
          .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            text-decoration: none;
            display: inline-block;
            transition: all 0.2s;
          }
          .btn-primary {
            background: #008060;
            color: white;
          }
          .btn-primary:hover {
            background: #006e52;
          }
          .btn-secondary {
            background: #f6f6f7;
            color: #202223;
            border: 1px solid #c9cccf;
          }
          .btn-secondary:hover {
            background: #e4e5e7;
          }
          .btn-danger {
            background: #d72c0d;
            color: white;
          }
          .btn-danger:hover {
            background: #bc2200;
          }
          .btn-sm {
            padding: 6px 12px;
            font-size: 13px;
          }
          .form-group {
            margin-bottom: 20px;
          }
          .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
            color: #202223;
          }
          .form-group input,
          .form-group textarea,
          .form-group select {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #c9cccf;
            border-radius: 4px;
            font-size: 14px;
          }
          .form-group textarea {
            min-height: 100px;
            resize: vertical;
          }
          .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
          }
          .modal {
            display: none; /* Hide by default */
            align-items: center;
            justify-content: center;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100vw;
            height: 100vh;
            background-color: rgba(0,0,0,0.5);
          }
          .modal-content form {
            width: 100%;
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          .modal.open {
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .modal-content {
            background: white;
        +   margin: auto;            /* horizontally & vertically center in the flex container */
            padding: 30px;
            border-radius: 8px;
            width: 90%;
            max-width: 600px;
            max-height: 90vh;
            overflow-y: auto;
            position: relative;
        +   box-sizing: border-box;  /* makes padding count _inside_ your 600px max-width */
          }
          .close {
            position: absolute;
            top: 15px;
            right: 20px;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
            color: #616161;
          }
          .close:hover {
            color: #202223;
          }
          .media-preview {
            max-width: 100px;
            max-height: 100px;
            object-fit: cover;
            border-radius: 4px;
            cursor: pointer;
          }
          .job-card {
            border: 1px solid #e1e3e5;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 15px;
            display: flex;
            justify-content: space-between;
            align-items: start;
          }
          .job-info h3 {
            margin: 0 0 5px 0;
            font-size: 16px;
          }
          .job-meta {
            display: flex;
            gap: 15px;
            margin-top: 8px;
            font-size: 13px;
            color: #616161;
          }
          .job-status {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
          }
          .job-info h3 {
            margin: 0 0 5px 0;
            font-size: 16px;
            cursor: pointer;
            color: #2c6ecb;
          }
          .job-info h3:hover {
            text-decoration: underline;
          }
          .status-active {
            background: #e3f1df;
            color: #4b5943;
          }
          .status-paused {
            background: #fff4e5;
            color: #b86e00;
          }
          .status-completed {
            background: #f1f1f1;
            color: #616161;
          }
          .submission-form-link {
            background: #f6f6f7;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
          }
          .submission-form-link a {
            color: #2c6ecb;
            text-decoration: none;
          }
          #mediaModal img,
          #mediaModal video {
            max-width: 90%;
            max-height: 90%;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
          }
          .job-actions {
            display: flex;
            gap: 8px;
            align-items: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Navigation Tabs -->
          <div class="tabs">
            <button class="tab active" onclick="switchTab('submissions')">All Submissions</button>
            <button class="tab" onclick="switchTab('jobs')">Jobs</button>
            <button class="tab" onclick="switchTab('customizations')">Customizations</button>
            <button class="tab" onclick="switchTab('email-settings')">Email Settings</button>
          </div>

          <!-- Submissions Tab -->
          <div id="submissions-tab" class="tab-content active">
          <div class="card">
              <h1>UGC Jobs Submission Dashboard</h1>
            <div class="submission-form-link">
                Link to UGC Jobs:
                <a href="${submitLink}" target="_blank">${submitLink}</a>
            </div>

            <div class="stats">
              <div class="stat">
                <div class="stat-value" id="totalCount">0</div>
                <div class="stat-label">Total Submissions</div>
              </div>
              <div class="stat">
                <div class="stat-value" id="pendingCount">0</div>
                <div class="stat-label">Pending Review</div>
              </div>
              <div class="stat">
                <div class="stat-value" id="approvedCount">0</div>
                <div class="stat-label">Approved</div>
              </div>
            </div>
          </div>

          <div class="card">
            <h1>Recent Submissions</h1>
              <!-- Add this filter section -->
              <div style="margin-bottom: 20px;">
                <div class="filter-group" style="display: flex; gap: 10px;">
                  <button class="btn btn-sm filter-btn active" onclick="filterSubmissions('pending')">Pending Review</button>
                  <button class="btn btn-sm filter-btn" onclick="filterSubmissions('approved')">Approved</button>
                  <button class="btn btn-sm filter-btn" onclick="filterSubmissions('rejected')">Rejected</button>
                  <button class="btn btn-sm filter-btn" onclick="filterSubmissions('all')">All</button>
                </div>
              </div>
              <!-- End of filter section -->
            <div id="submissionsTable">
              <div class="empty-state">
                <p>Loading submissions...</p>
              </div>
            </div>
          </div>
          </div>

          <!-- Jobs Tab -->
          <div id="jobs-tab" class="tab-content">
            <div class="card">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h1>UGC Jobs</h1>
                <button class="btn btn-primary" onclick="openJobModal()">Create New Job</button>
              </div>
              
              <div class="stats">
                <div class="stat">
                  <div class="stat-value" id="totalJobs">0</div>
                  <div class="stat-label">Total Jobs</div>
                </div>
                <div class="stat">
                  <div class="stat-value" id="activeJobs">0</div>
                  <div class="stat-label">Active Jobs</div>
                </div>
                <div class="stat">
                  <div class="stat-value" id="completedJobs">0</div>
                  <div class="stat-label">Completed</div>
                </div>
              </div>
            </div>

            <div class="card">
              <h2>Your Jobs</h2>
              <div id="jobsList">
                <div class="empty-state">
                  <p>Loading jobs...</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Customizations Tab -->
          <div id="customizations-tab" class="tab-content">
            <div class="card">
              <h1>Customize Your UGC Pages</h1>
              
              <form id="customizationForm">
                <h2>Colors</h2>
                <div class="form-group">
                  <label for="primaryColor">Primary Color</label>
                  <div class="color-input-wrapper">
                    <input type="color" id="primaryColorPicker" value="#d4b896">
                    <input type="text" id="primaryColor" name="primaryColor" value="#d4b896" pattern="^#[0-9A-Fa-f]{6}$">
                  </div>
                  <p class="help-text">Used for buttons, links, and main accents</p>
                </div>
                
                <div class="form-group">
                  <label for="secondaryColor">Background Color</label>
                  <div class="color-input-wrapper">
                    <input type="color" id="secondaryColorPicker" value="#f8f6f3">
                    <input type="text" id="secondaryColor" name="secondaryColor" value="#f8f6f3" pattern="^#[0-9A-Fa-f]{6}$">
                  </div>
                  <p class="help-text">Background color for sections</p>
                </div>
                
                <div class="form-group">
                  <label for="textColor">Text Color</label>
                  <div class="color-input-wrapper">
                    <input type="color" id="textColorPicker" value="#3a3a3a">
                    <input type="text" id="textColor" name="textColor" value="#3a3a3a" pattern="^#[0-9A-Fa-f]{6}$">
                  </div>
                  <p class="help-text">Main text color</p>
                </div>
                
                <div class="form-group">
                  <label for="accentColor">Accent Color</label>
                  <div class="color-input-wrapper">
                    <input type="color" id="accentColorPicker" value="#c9a961">
                    <input type="text" id="accentColor" name="accentColor" value="#c9a961" pattern="^#[0-9A-Fa-f]{6}$">
                  </div>
                  <p class="help-text">Secondary accent color</p>
                </div>
                
                <h2>Images</h2>
                <div class="form-group">
                  <label for="heroImageUrl">Hero Image URL</label>
                  <input type="url" id="heroImageUrl" name="heroImageUrl" placeholder="https://example.com/image.jpg">
                  <p class="help-text">Background image for the jobs page header (recommended: 1200x600px)</p>
                  <div id="heroImagePreview" class="image-preview" style="display: none;"></div>
                </div>
                
                <div class="form-group">
                  <label for="logoUrl">Logo URL</label>
                  <input type="url" id="logoUrl" name="logoUrl" placeholder="https://example.com/logo.png">
                  <p class="help-text">Your brand logo (recommended: 200x60px)</p>
                  <div id="logoPreview" class="image-preview" style="display: none;"></div>
                </div>
                
                <div class="form-group">
                  <label for="logoSize">Logo Size</label>
                  <select id="logoSize" name="logoSize">
                    <option value="small">Small (120x40px)</option>
                    <option value="medium">Medium (200x60px)</option>
                    <option value="large">Large (300x90px)</option>
                  </select>
                  <p class="help-text">Choose the size of your logo on the public pages</p>
                </div>
                
                <h2>Typography</h2>
                <div class="form-group">
                  <label for="headingFont">Heading Font</label>
                  <select id="headingFont" name="headingFont">
                    <option value="Montserrat">Montserrat</option>
                    <option value="Inter">Inter</option>
                    <option value="Playfair Display">Playfair Display</option>
                    <option value="Roboto">Roboto</option>
                    <option value="Open Sans">Open Sans</option>
                    <option value="Lato">Lato</option>
                  </select>
                </div>
                
                <div class="form-group">
                  <label for="bodyFont">Body Font</label>
                  <select id="bodyFont" name="bodyFont">
                    <option value="Inter">Inter</option>
                    <option value="Montserrat">Montserrat</option>
                    <option value="Roboto">Roboto</option>
                    <option value="Open Sans">Open Sans</option>
                    <option value="Lato">Lato</option>
                  </select>
                </div>
                
                <h2>Page Headings</h2>
                <div class="form-group">
                  <label for="jobsHeading">Jobs Page Heading</label>
                  <input type="text" id="jobsHeading" name="jobsHeading" placeholder="Create Content, Get Rewarded ✨" maxlength="100">
                  <p class="help-text">Main heading for the jobs listing page</p>
                </div>
                
                <div class="form-group">
                  <label for="jobsSubheading">Jobs Page Subheading</label>
                  <input type="text" id="jobsSubheading" name="jobsSubheading" placeholder="Share your authentic experiences with brands you love" maxlength="200">
                  <p class="help-text">Subheading for the jobs listing page</p>
                </div>
                
                <div class="form-group">
                  <label for="submitHeading">Submit Page Heading</label>
                  <input type="text" id="submitHeading" name="submitHeading" placeholder="Share Your Experience ✨" maxlength="100">
                  <p class="help-text">Main heading for the content submission page</p>
                </div>
                
                <div class="form-group">
                  <label for="submitSubheading">Submit Page Subheading</label>
                  <input type="text" id="submitSubheading" name="submitSubheading" placeholder="Get rewarded for your authentic content" maxlength="200">
                  <p class="help-text">Subheading for the content submission page</p>
                </div>
                
                <h2>Example Videos</h2>
                <div class="form-group">
                  <div class="checkbox-group">
                    <input type="checkbox" id="showExampleVideos" name="showExampleVideos" checked>
                    <label for="showExampleVideos">Show example videos section on jobs page</label>
                  </div>
                </div>
                
                <div class="form-group">
                  <label for="exampleVideo1">Example Video 1 URL</label>
                  <input type="url" id="exampleVideo1" name="exampleVideo1" placeholder="https://example.com/video1.mp4">
                  <p class="help-text">First example video (MP4, MOV, or video hosting URL)</p>
                </div>
                
                <div class="form-group">
                  <label for="exampleVideo2">Example Video 2 URL</label>
                  <input type="url" id="exampleVideo2" name="exampleVideo2" placeholder="https://example.com/video2.mp4">
                  <p class="help-text">Second example video (optional)</p>
                </div>
                
                <div class="form-group">
                  <label for="exampleVideo3">Example Video 3 URL</label>
                  <input type="url" id="exampleVideo3" name="exampleVideo3" placeholder="https://example.com/video3.mp4">
                  <p class="help-text">Third example video (optional)</p>
                </div>
                
                <div class="form-group">
                  <label for="exampleVideo4">Example Video 4 URL</label>
                  <input type="url" id="exampleVideo4" name="exampleVideo4" placeholder="https://example.com/video4.mp4">
                  <p class="help-text">Fourth example video (optional)</p>
                </div>
                
                <div class="form-group">
                  <label for="customCss">Custom CSS (Advanced)</label>
                  <textarea id="customCss" name="customCss" placeholder="/* Add custom CSS here */"></textarea>
                  <p class="help-text">Add custom CSS to further customize your pages. Be careful with this option.</p>
                </div>
                
                <div style="margin-top: 30px;">
                  <button type="submit" class="btn btn-primary">Save Changes</button>
                  <button type="button" class="btn btn-secondary" onclick="resetCustomizationsToDefaults()">Reset to Defaults</button>
                </div>
                
                <div id="customizationSuccessMessage" class="success-message" style="display: none; margin-top: 20px;">
                  Settings saved successfully!
                </div>
              </form>
            </div>
          </div>

          <!-- Email Settings Tab -->
          <div id="email-settings-tab" class="tab-content">
            <div class="card">
              <h1>Email Content Customization</h1>
              <p style="color: #666; margin-bottom: 30px;">Customize the email content sent to your customers at different stages of the UGC process.</p>
              
              <form id="emailSettingsForm">
                <!-- Email Sender Configuration -->
                <div class="email-section" style="background: #fff; border: 2px solid #008060;">
                  <h3>⚙️ Email Sender Settings</h3>
                  <div class="form-group">
                    <label for="emailFromName">From Name</label>
                    <input type="text" id="emailFromName" name="emailFromName" 
                           placeholder="Your Brand Name" maxlength="100">
                    <small style="color: #666;">The name that will appear as the sender (e.g., "Your Brand Name")</small>
                  </div>
                  <div class="form-group">
                    <label for="emailReplyTo">Reply-To Email Address</label>
                    <input type="email" id="emailReplyTo" name="emailReplyTo" 
                           placeholder="support@yourbrand.com" maxlength="255">
                    <small style="color: #666;">Where customer replies will be sent. Leave empty to disable replies.</small>
                  </div>
                  <div style="background: #f0f8ff; padding: 15px; border-radius: 4px; margin-top: 15px;">
                    <p style="margin: 0; color: #333; font-size: 13px;">
                      <strong>📧 How it works:</strong><br>
                      • Emails will be sent from: <strong><span id="fromNamePreview">UGC Rewards</span> &lt;noreply@ugcrewards.com&gt;</strong><br>
                      • Customer replies will go to: <strong><span id="replyToPreview">your reply-to address</span></strong><br>
                      • This ensures reliable email delivery while showing your brand name
                    </p>
                  </div>
                </div>

                <!-- Confirmation Email -->
                <div class="email-section">
                  <h3>📧 Confirmation Email (Sent when customer submits content)</h3>
                  <div class="form-group">
                    <label for="emailSubjectConfirmation">Email Subject</label>
                    <input type="text" id="emailSubjectConfirmation" name="emailSubjectConfirmation" 
                           placeholder="Thank you for your submission!" maxlength="255">
                  </div>
                  <div class="form-group">
                    <label for="emailBodyConfirmation">Email Body</label>
                    <textarea id="emailBodyConfirmation" name="emailBodyConfirmation" rows="4"
                              placeholder="Thank you for sharing your experience! Your submission has been received and is pending review."></textarea>
                    <small style="color: #666;">This email is sent immediately after a customer submits their content.</small>
                  </div>
                </div>



                <!-- Rejection Email -->
                <div class="email-section">
                  <h3>❌ Rejection Email (Sent when content is rejected)</h3>
                  <div class="form-group">
                    <label for="emailSubjectRejected">Email Subject</label>
                    <input type="text" id="emailSubjectRejected" name="emailSubjectRejected" 
                           placeholder="Update on your submission" maxlength="255">
                  </div>
                  <div class="form-group">
                    <label for="emailBodyRejected">Email Body</label>
                    <textarea id="emailBodyRejected" name="emailBodyRejected" rows="4"
                              placeholder="Thank you for your submission. Unfortunately, your submission was not approved at this time. We encourage you to try again!"></textarea>
                    <small style="color: #666;">This email is sent when you reject a customer's content.</small>
                  </div>
                </div>

                <!-- Reward Email -->
                <div class="email-section">
                  <h3>🎁 Reward Email (Sent with discount codes)</h3>
                  <div class="form-group">
                    <label for="emailSubjectReward">Email Subject</label>
                    <input type="text" id="emailSubjectReward" name="emailSubjectReward" 
                           placeholder="🎉 Your UGC Reward is Here!" maxlength="255">
                  </div>
                  <div class="form-group">
                    <label for="emailBodyReward">Email Body</label>
                    <textarea id="emailBodyReward" name="emailBodyReward" rows="4"
                              placeholder="Thank you for sharing your amazing content with us. As promised, here is your reward code:"></textarea>
                    <small style="color: #666;">This email is sent when a discount code is automatically generated and sent to the customer.</small>
                  </div>
                </div>

                <!-- Gift Card Email -->
                <div class="email-section">
                  <h3>💳 Gift Card Email (Sent with gift card codes)</h3>
                  <div class="form-group">
                    <label for="emailSubjectGiftcard">Email Subject</label>
                    <input type="text" id="emailSubjectGiftcard" name="emailSubjectGiftcard" 
                           placeholder="🎁 Your Gift Card is Here!" maxlength="255">
                  </div>
                  <div class="form-group">
                    <label for="emailBodyGiftcard">Email Body</label>
                    <textarea id="emailBodyGiftcard" name="emailBodyGiftcard" rows="4"
                              placeholder="Thank you for your amazing UGC submission! Here is your gift card:"></textarea>
                    <small style="color: #666;">This email is sent when a gift card code is provided to the customer.</small>
                  </div>
                </div>

                <!-- Free Product Email -->
                <div class="email-section">
                  <h3>📦 Free Product Email (Sent with free product codes)</h3>
                  <div class="form-group">
                    <label for="emailSubjectProduct">Email Subject</label>
                    <input type="text" id="emailSubjectProduct" name="emailSubjectProduct" 
                          placeholder="🎁 Your Free Product Code is Here!" maxlength="255">
                  </div>
                  <div class="form-group">
                    <label for="emailBodyProduct">Email Body</label>
                    <textarea id="emailBodyProduct" name="emailBodyProduct" rows="4"
                              placeholder="Thank you for your amazing UGC submission! Here's your code for a free product:"></textarea>
                    <small style="color: #666;">This email is sent when a free product discount code is generated for the customer.</small>
                  </div>
                </div>

                <div style="margin-top: 30px;">
                  <button type="button" class="btn btn-primary" onclick="saveEmailSettings()">Save Email Settings</button>
                  <button type="button" class="btn btn-secondary" onclick="resetEmailSettingsToDefaults()">Reset to Defaults</button>
                </div>
                
                <div id="emailSettingsSuccessMessage" class="success-message" style="display: none; margin-top: 20px;">
                  Email settings saved successfully!
                </div>
              </form>
            </div>
          </div>
        </div>

        <!-- Job Creation/Edit Modal -->
        <div id="jobModal" class="modal">
          <div class="modal-content">
            <span class="close" onclick="closeJobModal()">&times;</span>
            <h2 id="modalTitle">Create New UGC Job</h2>
            
            <form id="jobForm">
              <input type="hidden" id="jobId" name="jobId">
              
              <div class="form-group">
                <label for="jobTitle">Job Title*</label>
                <input type="text" id="jobTitle" name="title" required 
                       placeholder="e.g., 15-second video wearing our shoes at the park">
              </div>

              <div class="form-group">
                <label for="jobDescription">Description*</label>
                <textarea id="jobDescription" name="description" required
                          placeholder="Describe what you're looking for in detail..."></textarea>
              </div>

              <div class="form-group">
                 <label>Specific Requirements</label>
                 <ul id="requirementsList" class="requirements-list">
                   <li class="requirement-item">
                     <input type="text" class="requirement-input" placeholder="e.g., Must show product in use">
                     <button type="button" class="btn-remove" onclick="removeRequirement(this)">Remove</button>
                   </li>
                 </ul>
                 <button type="button" class="btn-add" onclick="addRequirement()">+ Add Requirement</button>
               </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="jobType">Content Type*</label>
                  <select id="jobType" name="type" required>
                    <option value="video">Video</option>
                    <option value="photo">Photo</option>
                  </select>
                </div>

                <div class="form-group">
                  <label for="spotsAvailable">Number of Spots*</label>
                  <input type="number" id="spotsAvailable" name="spotsAvailable" 
                         min="1" value="5" required>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="rewardType">Reward Type*</label>
                  <select id="rewardType" name="rewardType" onchange="updateRewardFields()">
                    <option value="percentage">Percentage Discount</option>
                    <option value="fixed">Fixed Amount Off</option>
                    <option value="product">Free Product</option>
                    <option value="giftcard">Gift Card</option>
                  </select>
                </div>

                <div class="form-group" id="rewardValueGroup">
                  <label for="rewardValue">Discount Percentage*</label>
                  <input type="number" id="rewardValue" name="rewardValue" 
                         min="1" value="20" required>
                </div>

                <div class="form-group" id="rewardProductGroup" style="display:none;">
                  <label for="rewardProduct">Product*</label>
                  <div style="display: flex; gap: 10px; align-items: center;">
                    <input type="text" id="rewardProduct" name="rewardProduct" 
                          placeholder="Select a product" readonly style="flex: 1;">
                    <input type="hidden" id="rewardProductId" name="rewardProductId">
                    <input type="hidden" id="rewardProductHandle" name="rewardProductHandle">
                    <button type="button" class="btn btn-secondary" onclick="openProductPicker()">Browse Products</button>
                  </div>
                  <div id="selectedProductInfo" style="margin-top: 10px; display: none;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <img id="productImage" src="" alt="" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;">
                      <div>
                        <div id="productTitle" style="font-weight: 500;"></div>
                        <div id="productPrice" style="font-size: 13px; color: #616161;"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="form-group" id="rewardGiftCardGroup" style="display:none;">
                  <label for="rewardGiftCardAmount">Gift Card Amount*</label>
                  <input type="number" id="rewardGiftCardAmount" name="rewardGiftCardAmount" min="1" placeholder="Amount in $">
                </div>
              </div>

              <div class="form-group">
                <label for="deadline">Deadline*</label>
                <input type="date" id="deadline" name="deadline">
              </div>

              <div class="form-group">
                <label for="exampleContent">Example Content URLs (Optional)</label>
                <textarea id="exampleContent" name="exampleContent"
                          placeholder="Links to examples or inspiration..."></textarea>
              </div>

              <div class="form-group" id="statusGroup" style="display:none;">
                <label for="status">Status*</label>
                <select id="status" name="status">
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button type="button" class="btn btn-secondary" onclick="closeJobModal()">Cancel</button>
                <button type="submit" class="btn btn-primary" id="submitJobBtn">Create Job</button>
              </div>
            </form>
          </div>
        </div>

        <!-- Job View Modal -->
        <div id="jobViewModal" class="modal">
          <div class="modal-content">
            <span class="close" onclick="closeJobViewModal()">&times;</span>
            <h2 id="viewModalTitle">Job Details</h2>
            
            <div style="margin-top: 20px;">
              <div class="form-group">
                <label style="font-weight: 600; color: #202223;">Title</label>
                <p id="viewJobTitle" style="margin: 5px 0; color: #616161;"></p>
              </div>
              
              <div class="form-group">
                <label style="font-weight: 600; color: #202223;">Description</label>
                <p id="viewJobDescription" style="margin: 5px 0; color: #616161; white-space: pre-line;"></p>
              </div>
              
              <div class="form-group">
                <label style="font-weight: 600; color: #202223;">Requirements</label>
                <p id="viewJobRequirements" style="margin: 5px 0; color: #616161; white-space: pre-line;"></p>
              </div>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="form-group">
                  <label style="font-weight: 600; color: #202223;">Content Type</label>
                  <p id="viewJobType" style="margin: 5px 0; color: #616161;"></p>
                </div>
                
                <div class="form-group">
                  <label style="font-weight: 600; color: #202223;">Status</label>
                  <p><span id="viewJobStatus" class="job-status"></span></p>
                </div>
              </div>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="form-group">
                  <label style="font-weight: 600; color: #202223;">Spots</label>
                  <p id="viewJobSpots" style="margin: 5px 0; color: #616161;"></p>
                </div>
                
                <div class="form-group">
                  <label style="font-weight: 600; color: #202223;">Reward</label>
                  <p id="viewJobReward" style="margin: 5px 0; color: #616161;"></p>
                </div>
              </div>
              
              <div class="form-group">
                <label style="font-weight: 600; color: #202223;">Deadline</label>
                <p id="viewJobDeadline" style="margin: 5px 0; color: #616161;"></p>
              </div>
              
              <div class="form-group">
                <label style="font-weight: 600; color: #202223;">Example Content URLs</label>
                <p id="viewJobExample" style="margin: 5px 0; color: #616161; white-space: pre-line;"></p>
              </div>
              
              <div class="form-group">
                <label style="font-weight: 600; color: #202223;">Direct Link for this Job</label>
                <p style="margin: 5px 0;">
                  <a id="viewJobLink" href="#" target="_blank" style="color: #2c6ecb; text-decoration: none;"></a>
                </p>
              </div>
              
              <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 30px;">
                <button type="button" class="btn btn-secondary" onclick="closeJobViewModal()">Close</button>
                <button type="button" class="btn btn-primary" id="editFromViewBtn" onclick="">Edit Job</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Media Preview Modal -->
        <div id="mediaModal" class="modal">
          <span class="close" onclick="closeModal()">&times;</span>
          <img class="modal-content" id="modalImage">
          <video class="modal-content" id="modalVideo" controls style="display:none;"></video>
        </div>

        <script>
          // Initialize Shopify App Bridge
          const AppBridge = window['app-bridge'];
          const createApp = AppBridge.default;
          const app = createApp({
            apiKey: '${process.env.SHOPIFY_API_KEY}',
            host: new URLSearchParams(location.search).get("host"),
          });

          // Initialize Shopify App Bridge ResourcePicker
          const ResourcePicker = window['app-bridge'].actions.ResourcePicker;

          // Open product picker
          function openProductPicker() {
            const productPicker = ResourcePicker.create(app, {
              resourceType: ResourcePicker.ResourceType.Product,
              options: {
                selectMultiple: false,
                showVariants: false
              }
            });

            productPicker.subscribe(ResourcePicker.Action.SELECT, (selectPayload) => {
              const selection = selectPayload.selection;
              if (selection && selection.length > 0) {
                const product = selection[0];
                
                // Set the product information
                document.getElementById('rewardProduct').value = product.title;
                document.getElementById('rewardProductId').value = product.id;
                document.getElementById('rewardProductHandle').value = product.handle;
                
                // Show product info
                const productInfo = document.getElementById('selectedProductInfo');
                productInfo.style.display = 'block';
                
                // Set product image
                const productImage = document.getElementById('productImage');
                if (product.images && product.images.length > 0) {
                  productImage.src = product.images[0].originalSrc;
                  productImage.alt = product.title;
                } else {
                  productImage.src = '';
                }
                
                // Set product title and price
                document.getElementById('productTitle').textContent = product.title;
                
                // Get the price from variants
                if (product.variants && product.variants.length > 0) {
                  const price = product.variants[0].price;
                  document.getElementById('productPrice').textContent = '$' + price;
                }
              }
            });

            productPicker.dispatch(ResourcePicker.Action.OPEN);
          }

          // Clear product selection
          function clearProductSelection() {
            document.getElementById('rewardProduct').value = '';
            document.getElementById('rewardProductId').value = '';
            document.getElementById('rewardProductHandle').value = '';
            document.getElementById('selectedProductInfo').style.display = 'none';
          }

          let editingJobId = null;

          // Tab switching
          function switchTab(tab) {
            // Update tab buttons
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            
            // Update tab content
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(tab + '-tab').classList.add('active');
            
            // Load data for the tab
            if (tab === 'jobs') {
              loadJobs();
            } else if (tab === 'customizations') {
              loadCustomizations();
            } else if (tab === 'email-settings') {
              loadEmailSettings();
            } else {
              loadSubmissions();
            }
          }

          // Job Modal Functions
          function openJobModal(jobId = null) {
            editingJobId = jobId;
            
            if (jobId) {
              // Edit mode
              document.getElementById('modalTitle').textContent = 'Edit UGC Job';
              document.getElementById('submitJobBtn').textContent = 'Update Job';
              document.getElementById('statusGroup').style.display = 'block';
              
              // Load job data
              const job = currentJobs.find(j => j.id === jobId);
              if (job) {
                document.getElementById('jobId').value = job.id;
                document.getElementById('jobTitle').value = job.title;
                document.getElementById('jobDescription').value = job.description;
                setRequirementsFromString(job.requirements || '');
                document.getElementById('jobType').value = job.type;
                document.getElementById('spotsAvailable').value = job.spots_available;
                document.getElementById('rewardType').value = job.reward_type;
                document.getElementById('rewardValue').value = job.reward_value;
                document.getElementById('rewardProduct').value = job.reward_product || '';
                document.getElementById('rewardGiftCardAmount').value = job.reward_giftcard_amount || '';
                
                // Handle product data when editing
                if (job.reward_type === 'product' && job.reward_product) {
                  document.getElementById('rewardProduct').value = job.reward_product;
                  document.getElementById('rewardProductId').value = job.reward_product_id || '';
                  document.getElementById('rewardProductHandle').value = job.reward_product_handle || '';
                  
                  // Show product info if we have the data
                  if (job.reward_product_image || job.reward_product_price) {
                    const productInfo = document.getElementById('selectedProductInfo');
                    productInfo.style.display = 'block';
                    
                    if (job.reward_product_image) {
                      document.getElementById('productImage').src = job.reward_product_image;
                      document.getElementById('productImage').alt = job.reward_product;
                    }
                    
                    document.getElementById('productTitle').textContent = job.reward_product;
                    if (job.reward_product_price) {
                      document.getElementById('productPrice').textContent = '$' + job.reward_product_price;
                    }
                  }
                }
                
                document.getElementById('deadline').value = job.deadline ? new Date(job.deadline).toISOString().slice(0, 10) : '';
                document.getElementById('exampleContent').value = job.example_content || '';
                document.getElementById('status').value = job.status;
                
                // Update reward fields visibility
                updateRewardFields();
              }
            } else {
              // Create mode
              document.getElementById('modalTitle').textContent = 'Create New UGC Job';
              document.getElementById('submitJobBtn').textContent = 'Create Job';
              document.getElementById('statusGroup').style.display = 'none';
              document.getElementById('jobForm').reset();
              document.getElementById('jobId').value = '';
              setRequirementsFromString(''); // This will create one empty requirement input

              // Add this line to ensure correct fields are shown
            updateRewardFields();
            }
            
            document.getElementById('jobModal').classList.add('open');
          }

          function closeJobModal() {
            document.getElementById('jobModal').classList.remove('open');
            document.getElementById('jobForm').reset();
            editingJobId = null;
          }

          function updateRewardFields() {
          const rewardType = document.getElementById('rewardType').value;
          const valueGroup = document.getElementById('rewardValueGroup');
          const productGroup = document.getElementById('rewardProductGroup');
          const giftCardGroup = document.getElementById('rewardGiftCardGroup');
          
          if (rewardType === 'product') {
            valueGroup.style.display = 'none';
            productGroup.style.display = 'block';
            giftCardGroup.style.display = 'none';
            document.getElementById('rewardValue').required = false;
            document.getElementById('rewardProduct').required = true;
            document.getElementById('rewardGiftCardAmount').required = false;
          } else if (rewardType === 'giftcard') {
            valueGroup.style.display = 'none';
            productGroup.style.display = 'none';
            giftCardGroup.style.display = 'block';
            document.getElementById('rewardValue').required = false;
            document.getElementById('rewardProduct').required = false;
            document.getElementById('rewardGiftCardAmount').required = true;
            // Clear product selection when switching away
            clearProductSelection();
          } else {
            valueGroup.style.display = 'block';
            productGroup.style.display = 'none';
            giftCardGroup.style.display = 'none';
            document.getElementById('rewardValue').required = true;
            document.getElementById('rewardProduct').required = false;
            document.getElementById('rewardGiftCardAmount').required = false;
            // Update label based on type
            const label = rewardType === 'percentage' ? 'Discount Percentage' : 'Amount Off ($)';
            valueGroup.querySelector('label').textContent = label + '*';
            // Clear product selection when switching away
            clearProductSelection();
          }
        }

          // Create/Update Job
          document.getElementById('jobForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Get requirements as a newline-separated string
            const requirementsString = getRequirementsString();
            
            const formData = new FormData(e.target);
            const jobData = Object.fromEntries(formData);
            jobData.requirements = requirementsString; // Add this line
            const jobId = jobData.jobId;
            delete jobData.jobId;
            
            // Convert deadline to end of day ISO format if provided
            if (jobData.deadline) {
              // If deadline is just a date (YYYY-MM-DD), append time
              if (/^\d{4}-\d{2}-\d{2}$/.test(jobData.deadline)) {
                jobData.deadline = jobData.deadline + 'T23:59:59';
              }
              jobData.deadline = new Date(jobData.deadline).toISOString();
            }
            
            try {
              const queryParams = window.location.search;
              const url = jobId 
                ? '/api/admin/jobs/' + jobId + queryParams
                : '/api/admin/jobs' + queryParams;
              const method = jobId ? 'PUT' : 'POST';
              
              const response = await fetch(url, {
                method: method,
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(jobData),
                credentials: 'include' // <-- ensure cookies/session sent
              });
              
              if (response.ok) {
                closeJobModal();
                loadJobs();
                alert(jobId ? 'Job updated successfully!' : 'Job created successfully!');
              } else {
                alert('Failed to ' + (jobId ? 'update' : 'create') + ' job');
              }
            } catch (error) {
              console.error('Error saving job:', error);
              alert('Error saving job');
            }
          });

          let currentJobs = [];

          // Load Jobs
          async function loadJobs() {
            try {
              const queryParams = window.location.search;
              const response = await fetch('/api/admin/jobs' + queryParams);
              const data = await response.json();
              
              currentJobs = data.jobs || [];
              
              // Update stats
              document.getElementById('totalJobs').textContent = currentJobs.length;
              document.getElementById('activeJobs').textContent = 
                currentJobs.filter(j => j.status === 'active').length;
              document.getElementById('completedJobs').textContent = 
                currentJobs.filter(j => j.status === 'completed').length;
              
              // Update jobs list
              const jobsList = document.getElementById('jobsList');
              
              if (currentJobs.length === 0) {
                jobsList.innerHTML = \`
                  <div class="empty-state">
                    <p>No jobs created yet.</p>
                    <p>Create your first job to start receiving targeted UGC!</p>
                  </div>
                \`;
              } else {
                jobsList.innerHTML = currentJobs.map(job => \`
                <div class="job-card">
                  <div class="job-info">
                    <h3 onclick="viewJobDetails(\${job.id})">\${job.title}</h3>
                    <div class="job-meta">
                      <span>Type: \${job.type}</span>
                      <span>Spots: \${job.spots_filled}/\${job.spots_available}</span>
                      <span>Reward: \${formatReward(job)}</span>
                      \${job.deadline ? \`<span>Deadline: \${new Date(job.deadline).toLocaleDateString()}</span>\` : ''}
                    </div>
                  </div>
                  <div class="job-actions">
                    <span class="job-status status-\${job.status}">\${job.status}</span>
                    <button class="btn btn-sm btn-secondary" onclick="openJobModal(\${job.id})">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteJob(\${job.id})">Delete</button>
                  </div>
                </div>
              \`).join('');
              }
            } catch (error) {
              console.error('Error loading jobs:', error);
              document.getElementById('jobsList').innerHTML = \`
                <div class="empty-state">
                  <p>Error loading jobs. Please refresh the page.</p>
                </div>
              \`;
            }
          }

          // Delete job
          async function deleteJob(jobId) {
            if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
              return;
            }
            
            try {
              const queryParams = window.location.search;
              const response = await fetch('/api/admin/jobs/' + jobId + queryParams, {
                method: 'DELETE',
                credentials: 'include' // <-- ensure cookies/session sent
              });
              
              if (response.ok) {
                loadJobs();
                alert('Job deleted successfully!');
              } else {
                alert('Failed to delete job');
              }
            } catch (error) {
              console.error('Error deleting job:', error);
              alert('Error deleting job');
            }
          }

          // View job details
          function viewJobDetails(jobId) {
            const job = currentJobs.find(j => j.id === jobId);
            if (!job) return;
            
            // Populate the view modal
            document.getElementById('viewJobTitle').textContent = job.title;
            document.getElementById('viewJobDescription').textContent = job.description;
            
            // Display requirements as bullet points
            const requirementsElement = document.getElementById('viewJobRequirements');
            if (job.requirements) {
              const requirements = job.requirements.split('\\n').filter(r => r.trim());
              if (requirements.length > 0) {
                requirementsElement.innerHTML = '<ul style="margin: 5px 0; padding-left: 20px;">' + 
                  requirements.map(req => \`<li>\${req}</li>\`).join('') + 
                  '</ul>';
              } else {
                requirementsElement.textContent = 'No specific requirements';
              }
            } else {
              requirementsElement.textContent = 'No specific requirements';
            }
            document.getElementById('viewJobType').textContent = job.type.charAt(0).toUpperCase() + job.type.slice(1);
            document.getElementById('viewJobStatus').textContent = job.status;
            document.getElementById('viewJobStatus').className = 'job-status status-' + job.status;
            document.getElementById('viewJobSpots').textContent = job.spots_filled + ' filled out of ' + job.spots_available + ' spots';
            document.getElementById('viewJobReward').textContent = formatReward(job);
            document.getElementById('viewJobDeadline').textContent = job.deadline ? new Date(job.deadline).toLocaleDateString() : 'No deadline';
            document.getElementById('viewJobExample').textContent = job.example_content || 'No examples provided';
            
            // Set the direct link
            const jobLink = '${process.env.HOST}/submit?jobId=' + job.id;
            document.getElementById('viewJobLink').href = jobLink;
            document.getElementById('viewJobLink').textContent = jobLink;
            
            // Set up the edit button
            document.getElementById('editFromViewBtn').onclick = function() {
              closeJobViewModal();
              openJobModal(jobId);
            };
            
            // Show the modal
            document.getElementById('jobViewModal').classList.add('open');
          }

          function closeJobViewModal() {
            document.getElementById('jobViewModal').classList.remove('open');
          }

          // View job from submission link
          async function viewJobFromSubmission(event, jobId) {
            event.preventDefault();
            
            // If we're not on the jobs tab, we need to fetch the job data
            if (!currentJobs || currentJobs.length === 0) {
              try {
                const queryParams = window.location.search;
                const response = await fetch('/api/admin/jobs' + queryParams);
                const data = await response.json();
                currentJobs = data.jobs || [];
              } catch (error) {
                console.error('Error loading jobs:', error);
                alert('Failed to load job details');
                return;
              }
            }
            
            // Now show the job details
            viewJobDetails(jobId);
          }

          // Format reward display
          function formatReward(job) {
            if (job.reward_type === 'percentage') {
              return job.reward_value + '% off';
            } else if (job.reward_type === 'fixed') {
              return '$' + job.reward_value + ' off';
            } else if (job.reward_type === 'giftcard') {
              return '$' + job.reward_giftcard_amount + ' gift card';
            } else {
              return 'Free ' + (job.reward_product || 'product');
            }
          }

          let allSubmissions = [];
          let currentSubmissionFilter = 'pending';
          let customizationsLoaded = false;
          
          // Update the loadSubmissions function
          async function loadSubmissions() {
            try {
              const queryParams = window.location.search;
              const response = await fetch('/api/admin/submissions' + queryParams);
              const data = await response.json();

              allSubmissions = data.submissions || [];

              // Update stats for all submissions
              document.getElementById('totalCount').textContent = allSubmissions.length;
              
              // Count pending submissions (including approved ones that need manual fulfillment)
              const pendingCount = allSubmissions.filter(s => 
                s.status === 'pending' || 
                (s.status === 'approved' && 
                 (s.reward_type === 'giftcard' || s.reward_type === 'product') && 
                 s.reward_fulfilled !== true)
              ).length;
              
              // Count fully approved submissions (no manual fulfillment needed OR already fulfilled)
              const approvedCount = allSubmissions.filter(s => 
                s.status === 'approved' && 
                (s.reward_type !== 'giftcard' && s.reward_type !== 'product' || s.reward_fulfilled === true)
              ).length;
              
              document.getElementById('pendingCount').textContent = pendingCount;
              document.getElementById('approvedCount').textContent = approvedCount;

              // Display filtered submissions
              displaySubmissions();
            } catch (error) {
              console.error('Error loading submissions:', error);
              document.getElementById('submissionsTable').innerHTML = \`
                <div class="empty-state">
                  <p>Error loading submissions. Please refresh the page.</p>
                </div>
              \`;
            }
          }

          // New function to display filtered submissions
          function displaySubmissions() {
            let filteredSubmissions;
            
            if (currentSubmissionFilter === 'all') {
              filteredSubmissions = allSubmissions;
            } else if (currentSubmissionFilter === 'pending') {
              // Show pending submissions OR approved gift card submissions that need manual fulfillment
              filteredSubmissions = allSubmissions.filter(s => 
                s.status === 'pending' || 
                (s.status === 'approved' && 
                 s.reward_type === 'giftcard' && 
                 s.reward_fulfilled !== true)
              );
            } else if (currentSubmissionFilter === 'approved') {
              // Show approved submissions that are automatically handled OR manually fulfilled
              filteredSubmissions = allSubmissions.filter(s => 
                s.status === 'approved' && 
                (s.reward_type !== 'giftcard' || s.reward_fulfilled === true)
              );
            } else {
              // For 'rejected' and other filters, use the original logic
              filteredSubmissions = allSubmissions.filter(s => s.status === currentSubmissionFilter);
            }

              const tableDiv = document.getElementById('submissionsTable');

            if (filteredSubmissions.length === 0) {
                tableDiv.innerHTML = \`
                  <div class="empty-state">
                  <p>No \${currentSubmissionFilter === \'all' ? '' : currentSubmissionFilter} submissions.</p>
                  </div>
                \`;
              return;
            }

                                tableDiv.innerHTML = \`
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Type</th>
                        <th>Job</th>
                        <th>Content</th>
                        <th>Media</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                  \${filteredSubmissions.map(sub => \`
                        <tr>
                          <td>\${new Date(sub.createdAt).toLocaleDateString()}</td>
                          <td>\${sub.customerEmail}</td>
                          <td>\${sub.type}</td>
                          <td style="max-width: 100px; word-wrap: break-word; word-break: break-word; white-space: normal; line-height: 1.2; font-size: 13px;">\${sub.job_title ? \`<a href="#" onclick="viewJobFromSubmission(event, \${sub.job_id})" style="color: #2c6ecb; text-decoration: none; cursor: pointer;">\${sub.job_title}</a>\` : '-'}</td>
                          <td class="review-content">\${sub.content || 'No content'}</td>
                          <td>
                            \${sub.mediaUrl ? (
                              sub.type === 'video' 
                                ? \`<video class="media-preview" onclick="openModal('\${sub.mediaUrl}', 'video')" src="\${sub.mediaUrl}"></video>\`
                                : \`<img class="media-preview" onclick="openModal('\${sub.mediaUrl}', 'image')" src="\${sub.mediaUrl}" alt="Submission media">\`
                            ) : '-'}
                          </td>
                          <td>
                        \${sub.status === 'pending' ? \`
                          <button onclick="approveSubmission(\${sub.id})" class="btn btn-primary btn-sm">Approve</button>
                          <button onclick="rejectSubmission(\${sub.id})" class="btn btn-danger btn-sm">Reject</button>
                        \` : \`
                          <span class="status-\${sub.status}">\${sub.status}</span>
                          \${sub.status === 'approved' && sub.reward_type === 'giftcard' ? \`
                            <div style="margin-top: 8px;">
                              \${!sub.reward_fulfilled ? \`
                                <button onclick="sendGiftCard(\${sub.id})" class="btn btn-primary btn-sm">Send Gift Card Email</button>
                              \` : \`
                                <span style="font-size: 12px; color: #008060;">
                                  ✓ Gift card email sent
                                </span>
                              \`}
                            </div>
                          \` : ''}

                        \`}
                      </td>
                        </tr>
                      \`).join('')}
                    </tbody>
                  </table>
                \`;
          }

          // New function to filter submissions
          function filterSubmissions(filter) {
            currentSubmissionFilter = filter;
            
            // Update active button
            document.querySelectorAll('.filter-btn').forEach(btn => {
              btn.classList.remove('active');
            });
            event.target.classList.add('active');
            
            displaySubmissions();
          }

          // Update approve/reject functions to refresh the display
          async function approveSubmission(submissionId) {
            if (!confirm('Are you sure you want to approve this submission? This will trigger any associated rewards.')) {
              return;
            }
            
            try {
              const queryParams = window.location.search;
              const response = await fetch('/api/admin/submissions/' + submissionId + '/approve' + queryParams, {
                method: 'POST'
              });
              
              if (response.ok) {
                loadSubmissions(); // This will refresh and maintain the current filter
              } else {
                alert('Failed to approve submission');
              }
            } catch (error) {
              console.error('Error approving submission:', error);
              alert('Error approving submission');
            }
          }

          // Modal functions
          function openModal(src, type) {
            const modal = document.getElementById('mediaModal');
            const modalImg = document.getElementById('modalImage');
            const modalVideo = document.getElementById('modalVideo');
            
            modal.classList.add('open');
            
            if (type === 'video') {
              modalImg.style.display = 'none';
              modalVideo.style.display = 'block';
              modalVideo.src = src;
            } else {
              modalVideo.style.display = 'none';
              modalImg.style.display = 'block';
              modalImg.src = src;
            }
          }

          function closeModal() {
            const modal = document.getElementById('mediaModal');
            const modalVideo = document.getElementById('modalVideo');
            modal.classList.remove('open');
            modalVideo.pause();
            modalVideo.src = '';
          }

          // Approve submission function
          async function approveSubmission(submissionId) {
            // Add confirmation dialog
            if (!confirm('Are you sure you want to approve this submission? This will trigger any associated rewards.')) {
              return;
            }
            
            try {
              const queryParams = window.location.search;
              const response = await fetch('/api/admin/submissions/' + submissionId + '/approve' + queryParams, {
                method: 'POST'
              });
              
              if (response.ok) {
                loadSubmissions();
              } else {
                alert('Failed to approve submission');
              }
            } catch (error) {
              console.error('Error approving submission:', error);
              alert('Error approving submission');
            }
          }

          // Reject submission function
          async function rejectSubmission(submissionId) {
            // Add confirmation dialog
            if (!confirm('Are you sure you want to reject this submission?')) {
              return;
            }
            
            try {
              const queryParams = window.location.search;
              const response = await fetch('/api/admin/submissions/' + submissionId + '/reject' + queryParams, {
                method: 'POST'
              });
              
              if (response.ok) {
                loadSubmissions();
              } else {
                alert('Failed to reject submission');
              }
            } catch (error) {
              console.error('Error rejecting submission:', error);
              alert('Error rejecting submission');
            }
          }
          
          //sending gift cards
          async function sendGiftCard(submissionId) {
          const code = prompt('Enter the gift card code:');
          const amount = prompt('Enter the gift card amount (numbers only):');
          
          if (!code || !amount) {
            alert('Gift card code and amount are required');
            return;
          }
          
          try {
            const queryParams = window.location.search;
            const response = await fetch(\`/api/admin/rewards/\${submissionId}/send-giftcard\${queryParams}\`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ 
                giftCardCode: code,
                amount: parseFloat(amount)
              })
            });
            
            if (response.ok) {
              alert('Gift card email sent successfully!');
              loadSubmissions();
            } else {
              alert('Failed to send gift card email');
            }
          } catch (error) {
            console.error('Error sending gift card:', error);
            alert('Error sending gift card email');
          }
        }

          // mark reward as fulfilled function
          async function markRewardFulfilled(event, submissionId, fulfilled) {
            try {
              const queryParams = window.location.search;
              const response = await fetch(\`/api/admin/rewards/\${submissionId}/fulfill\${queryParams}\`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                  fulfilled: fulfilled,
                  notes: fulfilled ? \`Manually fulfilled on \${new Date().toLocaleDateString()}\` : ''
                })
              });

              if (response.ok) {
                const submission = allSubmissions.find(s => s.id === submissionId);
                if (submission) {
                  submission.reward_fulfilled = fulfilled;
                }
                
                // Reload submissions to get updated data and refresh stats
                loadSubmissions();

                if (fulfilled) {
                  alert('Reward marked as sent! The submission will now appear in the "Approved" filter.');
                } else {
                  alert('Reward marked as pending. The submission will now appear in the "Pending Review" filter.');
                }
              } else {
                alert('Failed to update fulfillment status');
                event.target.checked = !fulfilled;
              }
            } catch (error) {
              console.error('Error updating fulfillment status:', error);
              alert('Error updating fulfillment status');
              event.target.checked = !fulfilled;
            }
          }

          // Close modals when clicking outside
          window.onclick = function(event) {
            if (event.target.classList.contains('modal')) {
              if (event.target.id === 'jobModal') {
                closeJobModal();
              } else if (event.target.id === 'mediaModal') {
                closeModal();
              } else if (event.target.id === 'jobViewModal') {
                closeJobViewModal();
              }
            }
          }

          // Add new requirement input
          function addRequirement() {
            const requirementsList = document.getElementById('requirementsList');
            const newItem = document.createElement('li');
            newItem.className = 'requirement-item';
            newItem.innerHTML = \`
              <input type="text" class="requirement-input" placeholder="Enter requirement">
              <button type="button" class="btn-remove" onclick="removeRequirement(this)">Remove</button>
            \`;
            requirementsList.appendChild(newItem);
          }

          // Remove requirement input
          function removeRequirement(button) {
            const requirementsList = document.getElementById('requirementsList');
            // Always keep at least one requirement input
            if (requirementsList.children.length > 1) {
              button.parentElement.remove();
            }
          }

          // Get requirements as formatted string
          function getRequirementsString() {
            const inputs = document.querySelectorAll('.requirement-input');
            const requirements = Array.from(inputs)
              .map(input => input.value.trim())
              .filter(value => value !== '');
            return requirements.join('\\n');
          }

          // Set requirements from string
          function setRequirementsFromString(requirementsString) {
            const requirementsList = document.getElementById('requirementsList');
            requirementsList.innerHTML = ''; // Clear existing
            
            if (requirementsString) {
              const requirements = requirementsString.split('\\n').filter(r => r.trim());
              requirements.forEach(req => {
                const newItem = document.createElement('li');
                newItem.className = 'requirement-item';
                newItem.innerHTML = \`
                  <input type="text" class="requirement-input" value="\${req}" placeholder="Enter requirement">
                  <button type="button" class="btn-remove" onclick="removeRequirement(this)">Remove</button>
                \`;
                requirementsList.appendChild(newItem);
              });
            }
            
            // If no requirements or empty, add one empty input
            if (requirementsList.children.length === 0) {
              addRequirement();
            }
          }

          // Load initial data
          loadSubmissions();

          // Customizations Functions
          async function loadCustomizations() {
            try {
              console.log('=== loadCustomizations called ===');
              const queryParams = window.location.search;
              // Add cache-busting parameter to prevent caching issues
              const cacheBuster = '&_t=' + Date.now();
              const response = await fetch('/api/admin/customizations' + queryParams + cacheBuster);
              const customizations = await response.json();
              
              console.log('Loaded customizations:', customizations);
              console.log('Checking if form elements exist...');
              
              // Check if form elements exist
              const primaryColorEl = document.getElementById('primaryColor');
              const primaryColorPickerEl = document.getElementById('primaryColorPicker');
              console.log('Primary color elements:', { primaryColorEl, primaryColorPickerEl });
              
              // Populate form with existing customizations
              if (customizations.primary_color) {
                const primaryColorEl = document.getElementById('primaryColor');
                const primaryColorPickerEl = document.getElementById('primaryColorPicker');
                if (primaryColorEl && primaryColorPickerEl) {
                  console.log('Before setting - Primary color value:', primaryColorEl.value);
                  console.log('Before setting - Primary color picker value:', primaryColorPickerEl.value);
                  primaryColorEl.value = customizations.primary_color;
                  primaryColorPickerEl.value = customizations.primary_color;
                  console.log('After setting - Primary color value:', primaryColorEl.value);
                  console.log('After setting - Primary color picker value:', primaryColorPickerEl.value);
                  console.log('Set primary color to:', customizations.primary_color);
                } else {
                  console.log('Primary color elements not found!');
                }
              }
              if (customizations.secondary_color) {
                const secondaryColorEl = document.getElementById('secondaryColor');
                const secondaryColorPickerEl = document.getElementById('secondaryColorPicker');
                if (secondaryColorEl && secondaryColorPickerEl) {
                  secondaryColorEl.value = customizations.secondary_color;
                  secondaryColorPickerEl.value = customizations.secondary_color;
                  console.log('Set secondary color to:', customizations.secondary_color);
                }
              }
              if (customizations.text_color) {
                const textColorEl = document.getElementById('textColor');
                const textColorPickerEl = document.getElementById('textColorPicker');
                if (textColorEl && textColorPickerEl) {
                  textColorEl.value = customizations.text_color;
                  textColorPickerEl.value = customizations.text_color;
                  console.log('Set text color to:', customizations.text_color);
                }
              }
              if (customizations.accent_color) {
                const accentColorEl = document.getElementById('accentColor');
                const accentColorPickerEl = document.getElementById('accentColorPicker');
                if (accentColorEl && accentColorPickerEl) {
                  accentColorEl.value = customizations.accent_color;
                  accentColorPickerEl.value = customizations.accent_color;
                  console.log('Set accent color to:', customizations.accent_color);
                }
              }
              if (customizations.hero_image_url) {
                const heroImageUrlEl = document.getElementById('heroImageUrl');
                if (heroImageUrlEl) {
                  heroImageUrlEl.value = customizations.hero_image_url;
                  showImagePreview('heroImagePreview', customizations.hero_image_url);
                }
              }
              if (customizations.logo_url) {
                const logoUrlEl = document.getElementById('logoUrl');
                if (logoUrlEl) {
                  logoUrlEl.value = customizations.logo_url;
                  showImagePreview('logoPreview', customizations.logo_url);
                }
              }
              
              // Load logo size
              if (customizations.logo_size) {
                const logoSizeEl = document.getElementById('logoSize');
                if (logoSizeEl) {
                  logoSizeEl.value = customizations.logo_size;
                }
              }
              if (customizations.heading_font) {
                const headingFontEl = document.getElementById('headingFont');
                if (headingFontEl) {
                  headingFontEl.value = customizations.heading_font;
                }
              }
              if (customizations.body_font) {
                const bodyFontEl = document.getElementById('bodyFont');
                if (bodyFontEl) {
                  bodyFontEl.value = customizations.body_font;
                }
              }
              
              // Load page headings
              if (customizations.jobs_heading) {
                const jobsHeadingEl = document.getElementById('jobsHeading');
                if (jobsHeadingEl) {
                  jobsHeadingEl.value = customizations.jobs_heading;
                }
              }
              if (customizations.jobs_subheading) {
                const jobsSubheadingEl = document.getElementById('jobsSubheading');
                if (jobsSubheadingEl) {
                  jobsSubheadingEl.value = customizations.jobs_subheading;
                }
              }
              if (customizations.submit_heading) {
                const submitHeadingEl = document.getElementById('submitHeading');
                if (submitHeadingEl) {
                  submitHeadingEl.value = customizations.submit_heading;
                }
              }
              if (customizations.submit_subheading) {
                const submitSubheadingEl = document.getElementById('submitSubheading');
                if (submitSubheadingEl) {
                  submitSubheadingEl.value = customizations.submit_subheading;
                }
              }
              if (customizations.show_example_videos !== undefined) {
                const showExampleVideosEl = document.getElementById('showExampleVideos');
                if (showExampleVideosEl) {
                  showExampleVideosEl.checked = customizations.show_example_videos;
                }
              }
              
              // Load example video URLs
              if (customizations.example_video_1) {
                const exampleVideo1El = document.getElementById('exampleVideo1');
                if (exampleVideo1El) {
                  exampleVideo1El.value = customizations.example_video_1;
                }
              }
              if (customizations.example_video_2) {
                const exampleVideo2El = document.getElementById('exampleVideo2');
                if (exampleVideo2El) {
                  exampleVideo2El.value = customizations.example_video_2;
                }
              }
              if (customizations.example_video_3) {
                const exampleVideo3El = document.getElementById('exampleVideo3');
                if (exampleVideo3El) {
                  exampleVideo3El.value = customizations.example_video_3;
                }
              }
              if (customizations.example_video_4) {
                const exampleVideo4El = document.getElementById('exampleVideo4');
                if (exampleVideo4El) {
                  exampleVideo4El.value = customizations.example_video_4;
                }
              }
              if (customizations.custom_css) {
                const customCssEl = document.getElementById('customCss');
                if (customCssEl) {
                  customCssEl.value = customizations.custom_css;
                }
              }
              
              console.log('Customizations loaded successfully');
              console.log('Final customizations object:', customizations);
            } catch (error) {
              console.error('Error loading customizations:', error);
            }
          }

          function showImagePreview(previewId, imageUrl) {
            const preview = document.getElementById(previewId);
            if (preview && imageUrl) {
              preview.style.display = 'block';
              preview.innerHTML = '<img src="' + imageUrl + '" alt="Preview">';
            }
          }

          function resetCustomizationsToDefaults() {
            if (confirm('Are you sure you want to reset all customizations to default values?')) {
              document.getElementById('primaryColor').value = '#d4b896';
              document.getElementById('primaryColorPicker').value = '#d4b896';
              document.getElementById('secondaryColor').value = '#f8f6f3';
              document.getElementById('secondaryColorPicker').value = '#f8f6f3';
              document.getElementById('textColor').value = '#3a3a3a';
              document.getElementById('textColorPicker').value = '#3a3a3a';
              document.getElementById('accentColor').value = '#c9a961';
              document.getElementById('accentColorPicker').value = '#c9a961';
              document.getElementById('heroImageUrl').value = '';
              document.getElementById('logoUrl').value = '';
              document.getElementById('logoSize').value = 'medium';
              document.getElementById('headingFont').value = 'Montserrat';
              document.getElementById('bodyFont').value = 'Inter';
              document.getElementById('showExampleVideos').checked = true;
              document.getElementById('exampleVideo1').value = '';
              document.getElementById('exampleVideo2').value = '';
              document.getElementById('exampleVideo3').value = '';
              document.getElementById('exampleVideo4').value = '';
              document.getElementById('customCss').value = '';
              
              // Clear image previews
              document.getElementById('heroImagePreview').style.display = 'none';
              document.getElementById('logoPreview').style.display = 'none';
            }
          }

          // Email Settings Functions
          async function loadEmailSettings() {
            try {
              const queryParams = window.location.search;
              const response = await fetch('/api/admin/customizations' + queryParams);
              const customizations = await response.json();
              
              console.log('Loaded email settings:', customizations);
              
              // Populate email settings form
              if (customizations.email_subject_confirmation) {
                document.getElementById('emailSubjectConfirmation').value = customizations.email_subject_confirmation;
              }
              if (customizations.email_body_confirmation) {
                document.getElementById('emailBodyConfirmation').value = customizations.email_body_confirmation;
              }
              
              if (customizations.email_subject_rejected) {
                document.getElementById('emailSubjectRejected').value = customizations.email_subject_rejected;
              }
              if (customizations.email_body_rejected) {
                document.getElementById('emailBodyRejected').value = customizations.email_body_rejected;
              }
              if (customizations.email_subject_reward) {
                document.getElementById('emailSubjectReward').value = customizations.email_subject_reward;
              }
              if (customizations.email_body_reward) {
                document.getElementById('emailBodyReward').value = customizations.email_body_reward;
              }
              if (customizations.email_subject_giftcard) {
                document.getElementById('emailSubjectGiftcard').value = customizations.email_subject_giftcard;
              }
              if (customizations.email_body_giftcard) {
                document.getElementById('emailBodyGiftcard').value = customizations.email_body_giftcard;
              }
              if (customizations.email_subject_product) {
                document.getElementById('emailSubjectProduct').value = customizations.email_subject_product;
              }
              if (customizations.email_body_product) {
                document.getElementById('emailBodyProduct').value = customizations.email_body_product;
              }
              if (customizations.email_from_name) {
                document.getElementById('emailFromName').value = customizations.email_from_name;
                document.getElementById('fromNamePreview').textContent = customizations.email_from_name;
              }
              if (customizations.email_reply_to) {
                document.getElementById('emailReplyTo').value = customizations.email_reply_to;
                document.getElementById('replyToPreview').textContent = customizations.email_reply_to;
              }
                            
              console.log('Email settings loaded successfully');
            } catch (error) {
              console.error('Error loading email settings:', error);
            }
          }

          function resetEmailSettingsToDefaults() {
            if (confirm('Are you sure you want to reset all email settings to default values?')) {
              document.getElementById('emailSubjectConfirmation').value = 'Thank you for your submission!';
              document.getElementById('emailBodyConfirmation').value = 'Thank you for sharing your experience! Your submission has been received and is pending review.';
              
              document.getElementById('emailSubjectRejected').value = 'Update on your submission';
              document.getElementById('emailBodyRejected').value = 'Thank you for your submission. Unfortunately, your submission was not approved at this time. We encourage you to try again!';
              document.getElementById('emailSubjectReward').value = '🎉 Your UGC Reward is Here!';
              document.getElementById('emailBodyReward').value = 'Thank you for sharing your amazing content with us. As promised, here is your reward code:';
              document.getElementById('emailSubjectGiftcard').value = '🎁 Your Gift Card is Here!';
              document.getElementById('emailBodyGiftcard').value = 'Thank you for your amazing UGC submission! Here is your gift card:';
            }
          }

          // Color picker synchronization
          document.addEventListener('DOMContentLoaded', function() {
                      // Load customizations immediately when DOM is ready
          console.log('DOM ready - loading customizations...');
          loadCustomizations();
            
            // Color picker synchronization
            document.querySelectorAll('input[type="color"]').forEach(picker => {
              const textInput = picker.nextElementSibling;
              picker.addEventListener('change', (e) => {
                textInput.value = e.target.value;
              });
            });

            document.querySelectorAll('input[type="text"][pattern]').forEach(input => {
              const picker = input.previousElementSibling;
              input.addEventListener('input', (e) => {
                if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                  picker.value = e.target.value;
                }
              });
            });

            document.getElementById('emailFromName').addEventListener('input', function(e) {
              const preview = document.getElementById('fromNamePreview');
              preview.textContent = e.target.value || 'UGC Rewards';
            });

            document.getElementById('emailReplyTo').addEventListener('input', function(e) {
              const preview = document.getElementById('replyToPreview');
              preview.textContent = e.target.value || 'no replies (emails will be no-reply)';
            });

            // Image preview on URL change
            document.getElementById('heroImageUrl').addEventListener('input', function() {
              if (this.value) {
                showImagePreview('heroImagePreview', this.value);
              } else {
                document.getElementById('heroImagePreview').style.display = 'none';
              }
            });

            document.getElementById('logoUrl').addEventListener('input', function() {
              if (this.value) {
                showImagePreview('logoPreview', this.value);
              } else {
                document.getElementById('logoPreview').style.display = 'none';
              }
            });

            // Customization form submission
            document.getElementById('customizationForm').addEventListener('submit', async function(e) {
              e.preventDefault();
              
              const formData = new FormData(this);
              const settings = Object.fromEntries(formData);
              settings.showExampleVideos = formData.has('showExampleVideos');
              
              try {
                const queryParams = window.location.search;
                const response = await fetch('/api/admin/customizations' + queryParams, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(settings),
                });
                
                if (response.ok) {
                  console.log('Customizations saved successfully');
                  document.getElementById('customizationSuccessMessage').style.display = 'block';
                  setTimeout(() => {
                    document.getElementById('customizationSuccessMessage').style.display = 'none';
                  }, 3000);
                  // Don't reload customizations - they're already applied
                } else {
                  console.error('Failed to save customizations');
                  alert('Failed to save settings');
                }
              } catch (error) {
                console.error('Error saving settings:', error);
                alert('Error saving settings');
              }
            });
          });
        </script>
      </body>
    </html>
  `);
});

// Add this route after your root route
app.get('/customizations', async (req, res) => {
  try {
    // Get shop from session with fallback
    let shop;
    if (res.locals.shopify?.session?.shop) {
      shop = res.locals.shopify.session.shop;
    } else {
      // Fallback: try to get shop from URL params or headers
      shop = req.query.shop || req.headers['x-shopify-shop-domain'] || 'default-shop.myshopify.com';
    }
    
    const customizations = await CustomizationsModel.getByShop(shop) || {};
  
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Customize UGC Pages - UGC Rewards</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://unpkg.com/@shopify/app-bridge@3"></script>
        <style>
          *, *::before, *::after {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f6f6f7;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
          }
          .card {
            background: white;
            border-radius: 8px;
            padding: 30px;
            margin-bottom: 20px;
            box-shadow: 0 0 0 1px rgba(63,63,68,.05), 0 1px 3px 0 rgba(63,63,68,.15);
          }
          h1 {
            margin: 0 0 30px 0;
            font-size: 24px;
            font-weight: 600;
          }
          h2 {
            margin: 0 0 20px 0;
            font-size: 18px;
            font-weight: 600;
          }
          .form-group {
            margin-bottom: 20px;
          }
          .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
            color: #202223;
          }
          .form-group input,
          .form-group select,
          .form-group textarea {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #c9cccf;
            border-radius: 4px;
            font-size: 14px;
          }
          .form-group textarea {
            min-height: 150px;
            resize: vertical;
            font-family: monospace;
          }
          .color-input-wrapper {
            display: flex;
            gap: 10px;
            align-items: center;
          }
          .color-input-wrapper input[type="color"] {
            width: 60px;
            height: 40px;
            padding: 4px;
            cursor: pointer;
          }
          .color-input-wrapper input[type="text"] {
            flex: 1;
          }
          .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            text-decoration: none;
            display: inline-block;
            transition: all 0.2s;
          }
          .btn-primary {
            background: #008060;
            color: white;
          }
          .btn-primary:hover {
            background: #006e52;
          }
          .btn-secondary {
            background: #f6f6f7;
            color: #202223;
            border: 1px solid #c9cccf;
            margin-left: 10px;
          }
          .btn-secondary:hover {
            background: #e4e5e7;
          }
          .preview-section {
            margin-top: 30px;
            padding: 20px;
            background: #f9fafb;
            border-radius: 6px;
          }
          .preview-iframe {
            width: 100%;
            height: 600px;
            border: 1px solid #e1e3e5;
            border-radius: 4px;
            background: white;
          }
          .image-preview {
            margin-top: 10px;
          }
          .image-preview img {
            max-width: 200px;
            max-height: 100px;
            border: 1px solid #e1e3e5;
            border-radius: 4px;
          }
          .help-text {
            font-size: 13px;
            color: #616161;
            margin-top: 5px;
          }
          .checkbox-group {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .checkbox-group input[type="checkbox"] {
            width: auto;
            margin: 0;
          }
          .success-message {
            background: #e3f1df;
            color: #4b5943;
            padding: 12px 16px;
            border-radius: 4px;
            margin-bottom: 20px;
            display: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <h1>Customize Your UGC Pages</h1>
            <div id="successMessage" class="success-message">
              Settings saved successfully!
            </div>
            
            <form id="customizationForm">
              <h2>Colors</h2>
              <div class="form-group">
                <label for="primaryColor">Primary Color</label>
                <div class="color-input-wrapper">
                  <input type="color" id="primaryColorPicker" value="${customizations.primary_color || '#d4b896'}">
                  <input type="text" id="primaryColor" name="primaryColor" value="${customizations.primary_color || '#d4b896'}" pattern="^#[0-9A-Fa-f]{6}$">
                </div>
                <p class="help-text">Used for buttons, links, and main accents</p>
              </div>

              <div class="form-group">
                <label for="secondaryColor">Background Color</label>
                <div class="color-input-wrapper">
                  <input type="color" id="secondaryColorPicker" value="${customizations.secondary_color || '#f8f6f3'}">
                  <input type="text" id="secondaryColor" name="secondaryColor" value="${customizations.secondary_color || '#f8f6f3'}" pattern="^#[0-9A-Fa-f]{6}$">
                </div>
                <p class="help-text">Background color for sections</p>
              </div>

              <div class="form-group">
                <label for="textColor">Text Color</label>
                <div class="color-input-wrapper">
                  <input type="color" id="textColorPicker" value="${customizations.text_color || '#3a3a3a'}">
                  <input type="text" id="textColor" name="textColor" value="${customizations.text_color || '#3a3a3a'}" pattern="^#[0-9A-Fa-f]{6}$">
                </div>
                <p class="help-text">Main text color</p>
              </div>

              <div class="form-group">
                <label for="accentColor">Accent Color</label>
                <div class="color-input-wrapper">
                  <input type="color" id="accentColorPicker" value="${customizations.accent_color || '#c9a961'}">
                  <input type="text" id="accentColor" name="accentColor" value="${customizations.accent_color || '#c9a961'}" pattern="^#[0-9A-Fa-f]{6}$">
                </div>
                <p class="help-text">Secondary accent color</p>
              </div>

              <h2>Images</h2>
              <div class="form-group">
                <label for="heroImageUrl">Hero Image URL</label>
                <input type="url" id="heroImageUrl" name="heroImageUrl" value="${customizations.hero_image_url || ''}" placeholder="https://example.com/image.jpg">
                <p class="help-text">Background image for the jobs page header (recommended: 1200x600px)</p>
                ${customizations.hero_image_url ? `<div class="image-preview"><img src="${customizations.hero_image_url}" alt="Hero image preview"></div>` : ''}
              </div>

              <div class="form-group">
                <label for="logoUrl">Logo URL</label>
                <input type="url" id="logoUrl" name="logoUrl" value="${customizations.logo_url || ''}" placeholder="https://example.com/logo.png">
                <p class="help-text">Your brand logo (recommended: 200x60px)</p>
                ${customizations.logo_url ? `<div class="image-preview"><img src="${customizations.logo_url}" alt="Logo preview"></div>` : ''}
              </div>

              <h2>Typography</h2>
              <div class="form-group">
                <label for="headingFont">Heading Font</label>
                <select id="headingFont" name="headingFont">
                  <option value="Montserrat" ${customizations.heading_font === 'Montserrat' ? 'selected' : ''}>Montserrat</option>
                  <option value="Inter" ${customizations.heading_font === 'Inter' ? 'selected' : ''}>Inter</option>
                  <option value="Playfair Display" ${customizations.heading_font === 'Playfair Display' ? 'selected' : ''}>Playfair Display</option>
                  <option value="Roboto" ${customizations.heading_font === 'Roboto' ? 'selected' : ''}>Roboto</option>
                  <option value="Open Sans" ${customizations.heading_font === 'Open Sans' ? 'selected' : ''}>Open Sans</option>
                  <option value="Lato" ${customizations.heading_font === 'Lato' ? 'selected' : ''}>Lato</option>
                </select>
              </div>

              <div class="form-group">
                <label for="bodyFont">Body Font</label>
                <select id="bodyFont" name="bodyFont">
                  <option value="Inter" ${customizations.body_font === 'Inter' ? 'selected' : ''}>Inter</option>
                  <option value="Montserrat" ${customizations.body_font === 'Montserrat' ? 'selected' : ''}>Montserrat</option>
                  <option value="Roboto" ${customizations.body_font === 'Roboto' ? 'selected' : ''}>Roboto</option>
                  <option value="Open Sans" ${customizations.body_font === 'Open Sans' ? 'selected' : ''}>Open Sans</option>
                  <option value="Lato" ${customizations.body_font === 'Lato' ? 'selected' : ''}>Lato</option>
                </select>
              </div>

              <h2>Additional Settings</h2>
              <div class="form-group">
                <div class="checkbox-group">
                  <input type="checkbox" id="showExampleVideos" name="showExampleVideos" ${customizations.show_example_videos !== false ? 'checked' : ''}>
                  <label for="showExampleVideos">Show example videos section on jobs page</label>
                </div>
              </div>

              <div class="form-group">
                <label for="customCss">Custom CSS (Advanced)</label>
                <textarea id="customCss" name="customCss" placeholder="/* Add custom CSS here */">${customizations.custom_css || ''}</textarea>
                <p class="help-text">Add custom CSS to further customize your pages. Be careful with this option.</p>
              </div>

              <div style="margin-top: 30px;">
                <button type="submit" class="btn btn-primary">Save Changes</button>
                <button type="button" class="btn btn-secondary" onclick="resetToDefaults()">Reset to Defaults</button>
              </div>
            </form>
          </div>

          <div class="card">
            <h2>Preview</h2>
            <p>Your jobs page will look like this with the current settings:</p>
            <div class="preview-section">
              <iframe class="preview-iframe" src="/jobs?preview=true" id="previewFrame"></iframe>
            </div>
            <p class="help-text">Note: Preview may not reflect all changes until saved.</p>
          </div>
        </div>

        <script>
          // Functions are now defined in the head section
          console.log('Body script loaded - functions should be available');
        </script>
        
        <script>
          // Global error handler
          window.addEventListener('error', function(e) {
            console.error('Global error:', e.error);
            console.error('Error details:', e);
          });
          
          // Initialize Shopify App Bridge
          const AppBridge = window['app-bridge'];
          const createApp = AppBridge.default;
          const app = createApp({
            apiKey: '${process.env.SHOPIFY_API_KEY}',
            host: new URLSearchParams(location.search).get("host"),
          });

          // Color picker synchronization
          document.querySelectorAll('input[type="color"]').forEach(picker => {
            const textInput = picker.nextElementSibling;
            picker.addEventListener('change', (e) => {
              textInput.value = e.target.value;
              updatePreview();
            });
          });

          document.querySelectorAll('input[type="text"][pattern]').forEach(input => {
            const picker = input.previousElementSibling;
            input.addEventListener('input', (e) => {
              if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                picker.value = e.target.value;
                updatePreview();
              }
            });
          });

          // Form submission
          document.getElementById('customizationForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const settings = Object.fromEntries(formData);
            settings.showExampleVideos = formData.has('showExampleVideos');
            
            try {
              const queryParams = window.location.search;
              const response = await fetch('/api/admin/customizations' + queryParams, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings),
              });
              
              if (response.ok) {
                document.getElementById('successMessage').style.display = 'block';
                setTimeout(() => {
                  document.getElementById('successMessage').style.display = 'none';
                }, 3000);
                updatePreview();
              } else {
                alert('Failed to save settings');
              }
            } catch (error) {
              console.error('Error saving settings:', error);
              alert('Error saving settings');
            }
          });

          // Reset to defaults
          function resetToDefaults() {
            if (confirm('Are you sure you want to reset all customizations to default values?')) {
              document.getElementById('primaryColor').value = '#d4b896';
              document.getElementById('primaryColorPicker').value = '#d4b896';
              document.getElementById('secondaryColor').value = '#f8f6f3';
              document.getElementById('secondaryColorPicker').value = '#f8f6f3';
              document.getElementById('textColor').value = '#3a3a3a';
              document.getElementById('textColorPicker').value = '#3a3a3a';
              document.getElementById('accentColor').value = '#c9a961';
              document.getElementById('accentColorPicker').value = '#c9a961';
              document.getElementById('heroImageUrl').value = '';
              document.getElementById('logoUrl').value = '';
              document.getElementById('headingFont').value = 'Montserrat';
              document.getElementById('bodyFont').value = 'Inter';
              document.getElementById('jobsHeading').value = '';
              document.getElementById('jobsSubheading').value = '';
              document.getElementById('submitHeading').value = '';
              document.getElementById('submitSubheading').value = '';
              document.getElementById('showExampleVideos').checked = true;
              document.getElementById('customCss').value = '';
              updatePreview();
            }
          }

          // Update preview (debounced)
          let updateTimeout;
          function updatePreview() {
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(() => {
              const iframe = document.getElementById('previewFrame');
              iframe.src = iframe.src; // Reload iframe
            }, 500);
          }

          // Update preview on any form change
          document.getElementById('customizationForm').addEventListener('change', updatePreview);

          // Email Settings Form submission - simplified since we're using inline handlers
          console.log('Email settings form setup complete - using inline handlers');
        </script>
      </body>
    </html>
  `);
  } catch (error) {
    console.error('Error loading customizations page:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Error - UGC Rewards</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; text-align: center;">
          <h1>Something went wrong</h1>
          <p>Unable to load the customizations page. Please try again.</p>
          <a href="/" style="color: #008060; text-decoration: none;">← Back to Dashboard</a>
        </body>
      </html>
    `);
  }
});

// API endpoint to get customizations (admin)
app.get('/api/admin/customizations', async (req, res) => {
  try {
    // Keep your original logic but add logging
    let shop;
    if (res.locals.shopify?.session?.shop) {
      shop = res.locals.shopify.session.shop;
      console.log('GET customizations - Using shop from session:', shop);
    } else {
      // Fallback: try to get shop from URL params or headers
      shop = req.query.shop || req.headers['x-shopify-shop-domain'] || 'ugc-rewards-app.myshopify.com';
      console.log('GET customizations - Using fallback shop:', shop);
    }
    
    console.log('GET customizations - Final shop:', shop);
    const customizations = await CustomizationsModel.getByShop(shop);
    console.log('GET customizations - Found:', customizations ? 'Yes' : 'No');
    res.json(customizations || {});
  } catch (error) {
    console.error('Error loading customizations:', error);
    res.status(500).json({ error: 'Failed to load customizations' });
  }
});

// API endpoint to save customizations
app.post('/api/admin/customizations', async (req, res) => {
  try {
    console.log('POST customizations - Request body:', req.body);
    console.log('POST customizations - Shopify session:', res.locals.shopify?.session);
    console.log('POST customizations - Query:', req.query);
    
    let shop;
    if (res.locals.shopify?.session?.shop) {
      shop = res.locals.shopify.session.shop;
      console.log('POST customizations - Using shop from session:', shop);
    } else {
      shop = req.query.shop || req.headers['x-shopify-shop-domain'] || 'ugc-rewards-app.myshopify.com';
      console.log('POST customizations - Using fallback shop:', shop);
    }
    
    console.log('POST customizations - Final shop:', shop);
    const customizations = await CustomizationsModel.upsert(shop, req.body);
    console.log('POST customizations - Saved successfully');
    res.json({ success: true, customizations });
  } catch (error) {
    console.error('Error saving customizations:', error);
    res.status(500).json({ error: 'Failed to save customizations' });
  }
});

// API endpoint to get customizations (public)
app.get('/api/public/customizations', async (req, res) => {
  try {
    // You'll need to pass the shop domain somehow - either from the job or a query param
    const shopDomain = req.query.shop || 'ugc-rewards-app.myshopify.com';
    const customizations = await CustomizationsModel.getByShop(shopDomain) || {};
    res.json(customizations);
  } catch (error) {
    console.error('Error fetching customizations:', error);
    res.json({}); // Return empty object on error
  }
});

// API endpoint to save email settings
app.post('/api/admin/email-settings', async (req, res) => {
  try {
    console.log('Saving email settings - Request body:', req.body);
    console.log('Shopify session:', res.locals.shopify?.session);
    console.log('Request query:', req.query);
    console.log('Request headers:', req.headers);
    
    // Get shop from session with fallback
    let shop;
    if (res.locals.shopify?.session?.shop) {
      shop = res.locals.shopify.session.shop;
      console.log('Using shop from session:', shop);
    } else {
      // Fallback: try to get shop from URL params or headers
      shop = req.query.shop || req.headers['x-shopify-shop-domain'] || 'ugc-rewards-app.myshopify.com';
      console.log('Using fallback shop:', shop);
    }
    
    // Get existing customizations and merge with email settings
    const existingCustomizations = await CustomizationsModel.getByShop(shop) || {};
    console.log('Existing customizations before email update:', existingCustomizations);
    
    const updatedCustomizations = {
      ...existingCustomizations,
      // Only update email-related fields, preserve all other customizations
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
      email_reply_to: req.body.emailReplyTo
    };
    
    console.log('Updated customizations after email update:', updatedCustomizations);
    
    const customizations = await CustomizationsModel.upsert(shop, updatedCustomizations);
    console.log('Saved email settings:', customizations);
    res.json({ success: true, customizations });
  } catch (error) {
    console.error('Error saving email settings:', error);
    res.status(500).json({ error: 'Failed to save email settings' });
  }
});

// Public submission endpoint with file upload
app.post('/api/public/submit', upload.single('media'), async (req, res) => {
  try {
  console.log('Received submission:', req.body);
    console.log('File:', req.file);

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
        // S3 upload
        try {
          mediaUrl = await uploadToS3(req.file, req.file.originalname);
          console.log('Uploaded to S3:', mediaUrl);
        } catch (error) {
          console.error('S3 upload failed:', error);
          // Fallback to local storage
          mediaUrl = `/uploads/${req.file.originalname}`;
        }
      } else {
        // Local storage fallback
        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const localPath = path.join(uploadsDir, req.file.originalname);
        fs.writeFileSync(localPath, req.file.buffer);
        mediaUrl = `/uploads/${req.file.originalname}`;
      }
      console.log('File uploaded:', mediaUrl);
    }
 
    // Save to database
    const submission = await SubmissionsModel.create({
      customerEmail,
      type,
      content,
      mediaUrl,
      status: 'pending',
      jobId: req.body.jobId || null
    });
 
    console.log('Saved submission:', submission);
 
    // Get job details if jobId is provided
    let jobName = 'General Submission';
    if (req.body.jobId) {
      try {
        const job = await JobsModel.getById(req.body.jobId);
        if (job) {
          jobName = job.title;
        }
      } catch (error) {
        console.error('Error getting job details:', error);
      }
    }
    
    // Get shop domain for app link
    let appShopDomain = res.locals.shopify?.session?.shop || req.query.shop;
    if (!appShopDomain && req.body.jobId) {
      try {
        const job = await JobsModel.getById(req.body.jobId);
        if (job && job.shop_domain) {
          appShopDomain = job.shop_domain;
        }
      } catch (error) {
        console.error('Error getting shop domain from job:', error);
      }
    }
    
    const appUrl = appShopDomain ? `https://${appShopDomain}/admin/apps/ugc-rewards-app` : 'https://ugc-rewards-app.myshopify.com/admin/apps/ugc-rewards-app';
    
    // Send notification email to admin
    await sendNotificationEmail({
      subject: 'New UGC Submission Received',
      text: `A new submission was received from ${customerEmail}.\nJob: ${jobName}\nType: ${type}\n\nView in app: ${appUrl}`,
      html: `<p>A new submission was received from <b>${customerEmail}</b>.</p><p><strong>Job:</strong> ${jobName}</p><p><strong>Type:</strong> ${type}</p><p><br><a href="${appUrl}" style="background: #008060; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View in App</a></p>`
    });
 
    // Get customizations for email content
    let shopDomain = res.locals.shopify?.session?.shop || req.query.shop;
    
    // If no shop domain from session/query, try to get it from the job
    if (!shopDomain && req.body.jobId) {
      try {
        const job = await JobsModel.getById(req.body.jobId);
        if (job && job.shop_domain) {
          shopDomain = job.shop_domain;
          console.log('🏪 Got shop domain from job:', shopDomain);
        }
      } catch (error) {
        console.error('Error getting job for shop domain:', error);
      }
    }
    
    console.log('🔍 Shop domain for customizations:', shopDomain);
    
    const customizations = shopDomain ? await CustomizationsModel.getByShop(shopDomain) : {};
    console.log('🎨 Loaded customizations:', customizations);
    console.log('📧 Confirmation email subject:', customizations.email_subject_confirmation);
    console.log('📧 Confirmation email body:', customizations.email_body_confirmation);
    
    // Send confirmation email to customer
    await sendCustomerConfirmationEmail({
      to: customerEmail,
      customerName: customerEmail,
      type,
      customSubject: customizations.email_subject_confirmation,
      customBody: customizations.email_body_confirmation,
      customizations // Add this line
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

// Get submissions endpoint
app.get('/api/admin/submissions', async (req, res) => {
  try {
    const submissions = await SubmissionsModel.getAll();
    
    // Transform the data to match the frontend expectations
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
 
// Approve submissions endpoint
app.post(
  '/api/admin/submissions/:id/approve',
  async (req, res) => {
    try {
      const submissionId = req.params.id;
      
      // 1️⃣ Fetch + validate submission
      const submission = await SubmissionsModel.getById(submissionId);
      if (!submission) {
        return res.status(404).json({ success: false, message: 'Submission not found' });
      }

      // 2️⃣ Mark it approved
      await SubmissionsModel.updateStatus(submissionId, 'approved');
      console.log(`Approved submission ${submissionId}`);

      // Declare job variable here so it's accessible throughout the function
      let job = null;

      // 3️⃣ If tied to a job, update spots + potentially fire reward
      if (submission.job_id) {
        await JobsModel.incrementSpotsFilled(submission.job_id);
        job = await JobsModel.getById(submission.job_id);
        console.log('Job details:', job);

        // If job is full, mark completed
        if (job.spots_filled >= job.spots_available) {
          await JobsModel.updateStatus(job.id, 'completed');
        }

        // 4️⃣ Handle automatic discount-code reward
        if (['percentage', 'fixed'].includes(job.reward_type)) {
          console.log('Attempting to create discount code for job:', job.id);
          console.log('Shop domain:', job.shop_domain);

          try {
            // a) Grab your Shopify session
            let session = res.locals.shopify?.session;
            if (!session) {
              const sessions = await sessionStorage.findSessionsByShop(job.shop_domain);
              session = sessions?.[0];
            }
            if (!session) {
              throw new Error(`No valid Shopify session for ${job.shop_domain}`);
            }

            // b) Instantiate the GraphQL client + your service
            const client = new Shopify.clients.Graphql({ session });
            const discountService = new ShopifyDiscountService(client);

            // c) Create the code (this also writes to RewardsModel)
            const { code } = await discountService.createDiscountCode(job, submission);
            console.log(`Discount code created: ${code}`);

            // Get customizations for email content
            const shopDomain = res.locals.shopify?.session?.shop || req.query.shop;
            const customizations = shopDomain ? await CustomizationsModel.getByShop(shopDomain) : {};
            
            // d) Send the reward email
            await sendRewardCodeEmail({
              to:        submission.customer_email,
              code,
              value:     job.reward_value,
              type:      job.reward_type,
              expiresIn: '30 days',
              customSubject: customizations.email_subject_reward,
              customBody: customizations.email_body_reward,
              customizations // Add this line
            });

            // e) Mark it sent in your RewardsModel
            const reward = await RewardsModel.getBySubmissionId(submission.id);
            if (reward) {
              await RewardsModel.markAsSent(reward.id);
              await RewardsModel.updateSubmissionRewardStatus(submission.id);
            }

            console.log(`Reward sent to ${submission.customer_email}: ${code}`);
          } catch (err) {
            console.error('Error creating/sending reward:', err);
            // swallow—approval should not fail
          }
        }

        // 🎁 Handle gift card rewards (manual fulfillment)
        if (job.reward_type === 'giftcard') {
          console.log('Processing gift card reward for job:', job.id);
          
          try {
            // Create a pending reward record
            await RewardsModel.create({
              submissionId: submission.id,
              jobId: job.id,
              type: 'giftcard',
              code: null, // Will be filled manually
              value: job.reward_giftcard_amount,
              status: 'pending_fulfillment',
              expiresAt: null,
              shopifyPriceRuleId: null,
              shopifyDiscountCodeId: null
            });
            
            // Send notification to admin
            await sendNotificationEmail({
              subject: 'Manual Gift Card Required - UGC Rewards',
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
                  <li>Send the gift card code to: ${submission.customer_email}</li>
                </ol>
              `
            });
            
            console.log(`Gift card reward pending for ${submission.customer_email}: $${job.reward_giftcard_amount}`);
          } catch (error) {
            console.error('Error processing gift card reward:', error);
            // Don't fail the approval if reward processing fails
          }
        }

        // 📦 Handle free product rewards
        console.log('=== CHECKING REWARD TYPE ===');
        console.log('Job reward type:', job.reward_type);
        console.log('Job reward product:', job.reward_product);
        console.log('Job reward product ID:', job.reward_product_id);
        
        if (job.reward_type === 'product') {
          console.log('✅ Processing free product reward for job:', job.id);
          console.log('Job details:', { 
            id: job.id, 
            title: job.title, 
            reward_product_id: job.reward_product_id,
            shop_domain: job.shop_domain 
          });
          
          try {
            // Get Shopify session
            let session = res.locals.shopify?.session;
            console.log('Initial session from res.locals:', !!session);
            
            if (!session) {
              console.log('No session in res.locals, trying to find by shop domain:', job.shop_domain);
              const sessions = await sessionStorage.findSessionsByShop(job.shop_domain);
              session = sessions?.[0];
              console.log('Found session from storage:', !!session);
            }
            
            if (!session) {
              throw new Error(`No valid Shopify session for ${job.shop_domain}`);
            }

            console.log('Creating GraphQL client with session');
            // Create the discount code
            const client = new Shopify.clients.Graphql({ session });
            const discountService = new ShopifyDiscountService(client);
            
            console.log('Calling createProductDiscountCode...');
            // Create a 100% off discount for the specific product
            const { code } = await discountService.createProductDiscountCode(job, submission);
            console.log(`Free product discount code created: ${code}`);

            // Get customizations for email content
            const customizations = await CustomizationsModel.getByShop(job.shop_domain) || {};

            // Send the free product email
            await sendFreeProductEmail({
              to: submission.customer_email,
              code: code,
              productName: job.reward_product,
              customSubject: customizations.email_subject_product,
              customBody: customizations.email_body_product,
              customizations
            });

            console.log(`Free product email sent to ${submission.customer_email} with code: ${code}`);

            
            // TEST: If no code was created, create a simple test code
            if (!code) {
              console.log('⚠️ No code returned from createProductDiscountCode, creating test code');
              const testCode = `TEST${submission.id}${Date.now().toString(36).toUpperCase()}`;
              console.log('Created test code:', testCode);
              job.discountCode = testCode;
            } else {
              job.discountCode = code;
            }
            
            // Mark reward as sent
            const reward = await RewardsModel.getBySubmissionId(submission.id);
            if (reward) {
              await RewardsModel.markAsSent(reward.id);
              await RewardsModel.updateSubmissionRewardStatus(submission.id);
            }
            
            console.log(`Free product code created for ${submission.customer_email}: ${code}`);
            console.log('✅ FINAL - Stored discount code in job object:', job.discountCode);
          } catch (error) {
            console.error('Error creating free product reward:', error);
            console.error('Error stack:', error.stack);
            
            // Create a fallback test code if Shopify API fails
            console.log('🔄 Creating fallback test code due to Shopify API error');
            const fallbackCode = `FALLBACK${submission.id}${Date.now().toString(36).toUpperCase()}`;
            job.discountCode = fallbackCode;
            console.log('✅ Created fallback code:', fallbackCode);
          }
        }
        
        // 5️⃣ Send customer email WITH job-specific message
        let additionalMessage = '';
        
        console.log('🔍 BEFORE EMAIL - Job object details:');
        console.log('  - Job discount code:', job.discountCode);
        console.log('  - Job reward type:', job.reward_type);
        console.log('  - Job reward product:', job.reward_product);
        console.log('  - Full job object keys:', Object.keys(job));
        
        if (job.reward_type === 'giftcard') {
          // Don't send approval email for gift cards - they'll get the gift card email instead
          console.log('🎁 Skipping approval email for gift card submission - will send gift card email separately');
          res.json({ success: true, message: 'Submission approved' });
          return;
        } else if (job.reward_type === 'product') {
          if (job.discountCode) {
            additionalMessage = `Your free ${job.reward_product || 'product'} is ready! Use discount code ${job.discountCode} at checkout to get 100% off. This code expires in 30 days.`;
            console.log('✅ Setting additional message with discount code:', additionalMessage);
          } else {
            additionalMessage = `Instructions for claiming your free ${job.reward_product || 'product'} will be sent to you within 24 hours. Keep an eye on your inbox!`;
            console.log('❌ No discount code found, using fallback message');
          }
        }
        
        // Get customizations for email content
        const shopDomain = res.locals.shopify?.session?.shop || req.query.shop;
        const customizations = shopDomain ? await CustomizationsModel.getByShop(shopDomain) : {};
        
        // Approval email removed - discount codes are sent via separate reward emails
      }

      res.json({ success: true, message: 'Submission approved' });
    } catch (error) {
      console.error('Error approving submission:', error);
      res
        .status(500)
        .json({ success: false, message: 'Failed to approve submission' });
    }
  }
);
 
 // Reject submission endpoint
app.post('/api/admin/submissions/:id/reject', async (req, res) => {
  try {
    const submissionId = req.params.id;
    
    // Check if submission exists
    const submission = await SubmissionsModel.getById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }
    
    // If this was previously approved and is for a job, decrement the spots filled
    if (submission.status === 'approved' && submission.job_id) {
      await JobsModel.decrementSpotsFilled(submission.job_id);
      
      // If job was completed, set it back to active
      const job = await JobsModel.getById(submission.job_id);
      if (job && job.status === 'completed' && job.spots_filled < job.spots_available) {
        await JobsModel.updateStatus(submission.job_id, 'active');
      }
    }
    
    // Update status to rejected
    await SubmissionsModel.updateStatus(submissionId, 'rejected');
    console.log('Rejected submission ' + submissionId);

    // Get customizations for email content
    const shopDomain = res.locals.shopify?.session?.shop || req.query.shop;
    const customizations = shopDomain ? await CustomizationsModel.getByShop(shopDomain) : {};
    
    // Send status update email to customer
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

// manual reward submission fulfillment endpoint
app.post('/api/admin/rewards/:submissionId/fulfill', async (req, res) => {
  try {
    const submissionId = req.params.submissionId;
    const { fulfilled, notes } = req.body;
    
    // Update the reward status
    const reward = await RewardsModel.getBySubmissionId(submissionId);
    if (reward) {
      await RewardsModel.update(reward.id, {
        status: fulfilled ? 'fulfilled' : 'pending_fulfillment',
        fulfilled_at: fulfilled ? new Date() : null,
        fulfilled_notes: notes
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating reward fulfillment:', error);
    res.status(500).json({ error: 'Failed to update fulfillment status' });
  }
});

// Add this endpoint for sending gift card codes manually
app.post('/api/admin/rewards/:submissionId/send-giftcard', shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { giftCardCode, amount } = req.body;
    
    // Get the submission and reward details
    const submission = await SubmissionsModel.getById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    // Get customizations for email content
    const shop = res.locals.shopify?.session?.shop || req.query.shop;
    const customizations = await CustomizationsModel.getByShop(shop) || {};
    
    // Send the gift card email
    await sendGiftCardEmail({
      to: submission.customer_email,
      code: giftCardCode,
      amount: amount,
      customSubject: customizations.email_subject_giftcard,
      customBody: customizations.email_body_giftcard,
      customizations
    });
    
    // Update reward status
    const reward = await RewardsModel.getBySubmissionId(submissionId);
    if (reward) {
      await RewardsModel.update(reward.id, {
        code: giftCardCode,
        status: 'fulfilled',
        fulfilled_at: new Date()
      });
    }
    
    // Update submission reward_fulfilled status
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