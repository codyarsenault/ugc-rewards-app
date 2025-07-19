import express from 'express';
import { shopifyApp } from '@shopify/shopify-app-express';
import { SQLiteSessionStorage } from '@shopify/shopify-app-session-storage-sqlite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SubmissionsModel } from './models/submissions.js';
import multer from 'multer';
import fs from 'fs';
import { uploadToS3 } from './setup-s3.js';
import { sendNotificationEmail, sendCustomerConfirmationEmail, sendCustomerStatusEmail } from './services/email.js';
import jobRoutes from './routes/jobs.js';
import { JobsModel } from './models/jobs.js';

dotenv.config();

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
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept images and videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'));
    }
  }
});

// Initialize Shopify app
const shopify = shopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: ['write_discounts', 'read_customers'],
    hostName: (process.env.HOST || 'localhost:3000').replace(/https?:\/\//, ''),
    apiVersion: '2023-10',
  },
  auth: {
    path: '/api/auth',
    callbackPath: '/api/auth/callback',
  },
  webhooks: {
    path: '/api/webhooks',
  },
  sessionStorage: new SQLiteSessionStorage(path.join(__dirname, '../database/session.db')),
});

const app = express();

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

// Add job routes - without the middleware here since it's applied in the routes file
app.use('/api', jobRoutes);

// Route to show submission form
app.get('/submit', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'submit.html'));
});

// Route to show jobs browsing page
app.get('/jobs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'jobs.html'));
});

// Root route - Admin dashboard with jobs functionality
app.get('/', shopify.ensureInstalledOnShop(), async (req, res) => {
  const submitLink = `${process.env.HOST}/jobs`;
  
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>UGC Rewards Admin</title>
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
            max-width: 350px;
          }
          .review-content {
            white-space: pre-line;
            word-break: break-word;
            max-width: 350px;
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
                  <label for="rewardProduct">Product Name*</label>
                  <input type="text" id="rewardProduct" name="rewardProduct" 
                         placeholder="Product name">
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
                body: JSON.stringify(jobData)
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
                method: 'DELETE'
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

          // Load submissions
          async function loadSubmissions() {
            try {
              const queryParams = window.location.search;
              const response = await fetch('/api/admin/submissions' + queryParams);
              const data = await response.json();

              const submissions = data.submissions || [];

              // Update stats
              document.getElementById('totalCount').textContent = submissions.length;
              document.getElementById('pendingCount').textContent =
                submissions.filter(s => s.status === 'pending').length;
              document.getElementById('approvedCount').textContent =
                submissions.filter(s => s.status === 'approved').length;

              // Update table
              const tableDiv = document.getElementById('submissionsTable');

              if (submissions.length === 0) {
                tableDiv.innerHTML = \`
                  <div class="empty-state">
                    <p>No submissions yet.</p>
                    <p>Share your submission form link with customers to start collecting content!</p>
                  </div>
                \`;
              } else {
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
                      \${submissions.map(sub => \`
                        <tr>
                          <td>\${new Date(sub.createdAt).toLocaleDateString()}</td>
                          <td>\${sub.customerEmail}</td>
                          <td>\${sub.type}</td>
                          <td>\${sub.job_title ? \`<a href="#" onclick="viewJobFromSubmission(event, \${sub.job_id})" style="color: #2c6ecb; text-decoration: none; cursor: pointer;">\${sub.job_title}</a>\` : '-'}</td>
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
                              <button onclick="approveSubmission(\${sub.id})" class="btn btn-primary">Approve</button>
                              <button onclick="rejectSubmission(\${sub.id})" class="btn btn-danger">Reject</button>
                            \` : sub.status}
                          </td>
                        </tr>
                      \`).join('')}
                    </tbody>
                  </table>
                \`;
              }
            } catch (error) {
              console.error('Error loading submissions:', error);
              document.getElementById('submissionsTable').innerHTML = \`
                <div class="empty-state">
                  <p>Error loading submissions. Please refresh the page.</p>
                </div>
              \`;
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
        </script>
      </body>
    </html>
  `);
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
 
    // Send notification email to admin
    await sendNotificationEmail({
      subject: 'New UGC Submission Received',
      text: `A new submission was received from ${customerEmail}.\nType: ${type}\nContent: ${content}`,
      html: `<p>A new submission was received from <b>${customerEmail}</b>.</p><p>Type: ${type}</p><p>Content: ${content}</p>`
    });
 
    // Send confirmation email to customer
    await sendCustomerConfirmationEmail({
      to: customerEmail,
      customerName: customerEmail,
      type
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
 app.get('/api/admin/submissions', shopify.ensureInstalledOnShop(), async (req, res) => {
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
      job_id: sub.job_id
    }));
    
    res.json({ submissions: transformedSubmissions });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
 });
 
// Approve submission endpoint
app.post('/api/admin/submissions/:id/approve', shopify.ensureInstalledOnShop(), async (req, res) => {
  try {
    const submissionId = req.params.id;
    
    // Check if submission exists
    const submission = await SubmissionsModel.getById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }
    
    // Update status to approved
    await SubmissionsModel.updateStatus(submissionId, 'approved');
    console.log('Approved submission ' + submissionId);

    // If this submission is for a job, increment the spots filled
    if (submission.job_id) {
      await JobsModel.incrementSpotsFilled(submission.job_id);
      
      // Check if job is now full and update status if needed
      const job = await JobsModel.getById(submission.job_id);
      if (job && job.spots_filled >= job.spots_available) {
        await JobsModel.updateStatus(submission.job_id, 'completed');
      }
    }

    // Send status update email to customer
    await sendCustomerStatusEmail({
      to: submission.customer_email,
      status: 'approved',
      type: submission.type
    });
    
    res.json({ success: true, message: 'Submission approved' });
  } catch (error) {
    console.error('Error approving submission:', error);
    res.status(500).json({ success: false, message: 'Failed to approve submission' });
  }
});
 
 // Reject submission endpoint
app.post('/api/admin/submissions/:id/reject', shopify.ensureInstalledOnShop(), async (req, res) => {
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

    // Send status update email to customer
    await sendCustomerStatusEmail({
      to: submission.customer_email,
      status: 'rejected',
      type: submission.type
    });
    
    res.json({ success: true, message: 'Submission rejected' });
  } catch (error) {
    console.error('Error rejecting submission:', error);
    res.status(500).json({ success: false, message: 'Failed to reject submission' });
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