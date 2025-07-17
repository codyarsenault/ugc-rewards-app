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

// Route to show submission form
app.get('/submit', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'submit.html'));
});

// Root route - modified to handle Shopify admin properly
app.get('/', shopify.ensureInstalledOnShop(), async (req, res) => {
  const submitLink = `${process.env.HOST}/submit`;
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>UGC Rewards Admin</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://unpkg.com/@shopify/app-bridge@3"></script>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f6f6f7;
          }
          .container {
            max-width: 1000px;
            margin: 0 auto;
          }         
          td {
            padding: 12px;
            border-bottom: 1px solid #e1e3e5;
            font-size: 14px;
            vertical-align: top;
            word-break: break-word;
            max-width: 350px; /* Adjust as needed */
          }

          .review-content {
            white-space: pre-line;
            word-break: break-word;
            max-width: 350px;
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
          }
          .empty-state {
            text-align: center;
            padding: 60px 20px;
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
          .media-preview {
            max-width: 100px;
            max-height: 100px;
            object-fit: cover;
            border-radius: 4px;
            cursor: pointer;
          }
          .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.9);
          }
          .modal-content {
            margin: auto;
            display: block;
            max-width: 90%;
            max-height: 90%;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
          }
          .close {
            position: absolute;
            top: 15px;
            right: 35px;
            color: #f1f1f1;
            font-size: 40px;
            font-weight: bold;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <h1>UGC Rewards Dashboard</h1>
            <div class="submission-form-link">
              Share this link with customers:
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

        <!-- Modal for full-size media preview -->
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
                              <button onclick="approveSubmission(\${sub.id})" style="background: #008060; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-right: 5px;">Approve</button>
                              <button onclick="rejectSubmission(\${sub.id})" style="background: #d72c0d; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">Reject</button>
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
            
            modal.style.display = 'block';
            
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
            modal.style.display = 'none';
            modalVideo.pause();
            modalVideo.src = '';
          }

          // Load on page load
          loadSubmissions();

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

          // Close modal when clicking outside
          window.onclick = function(event) {
            const modal = document.getElementById('mediaModal');
            if (event.target == modal) {
              closeModal();
            }
          }
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

    // Prepare media URL if file was uploaded
    let mediaUrl = null;
    if (req.file) {
     /* console.log('S3 credentials detected:', {
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        AWS_REGION: process.env.AWS_REGION,
        S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
      });*/
      const hasS3Creds = (
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        process.env.AWS_REGION &&
        process.env.S3_BUCKET_NAME
      );
      if (hasS3Creds) {
        // S3 upload as before
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
      status: 'pending'
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
      createdAt: sub.created_at
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