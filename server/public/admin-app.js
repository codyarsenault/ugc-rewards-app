// Wait for App Bridge to be initialized
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, waiting for App Bridge...');
  
  // Check if App Bridge is initialized
  const checkInterval = setInterval(() => {
    if (window.makeAuthenticatedRequest) {
      clearInterval(checkInterval);
      console.log('App Bridge ready, initializing app functionality...');
      initializeApp();
    }
  }, 100);
  
  // Timeout after 5 seconds
  setTimeout(() => {
    clearInterval(checkInterval);
    if (!window.makeAuthenticatedRequest) {
      console.error('App Bridge failed to initialize');
      alert('Failed to initialize app. Please refresh the page.');
    }
  }, 5000);
});

// Global variables
let editingJobId = null;
let currentJobs = [];
let allSubmissions = [];
let currentSubmissionFilter = 'pending';
let customizationsLoaded = false;

// Initialize the app
function initializeApp() {
  console.log('Initializing app functionality...');
  
  // Set up lazy loading for images
  const lazyImageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        lazyImageObserver.unobserve(img);
      }
    });
  });
  
  window.lazyImageObserver = lazyImageObserver;
  
  // Optimistic gating: temporarily disable cash option until plan loads
  const rewardTypeSelect = document.getElementById('rewardType');
  if (rewardTypeSelect) {
    const cashOption = Array.from(rewardTypeSelect.options).find(o => o.value === 'cash');
    if (cashOption) cashOption.disabled = true;
  }

  // Set up event listeners
  setupEventListeners();
  
  // Load plan info early to adjust UI (e.g., hide cash)
  loadPlanInfo().catch(console.error);

  // Load initial data
  loadSubmissions();
  loadEmailSettings();
  
  // Start periodic session health checks
  startSessionHealthCheck();
}

// Set up all event listeners
function setupEventListeners() {
  // Job form submission
  const jobForm = document.getElementById('jobForm');
  if (jobForm) {
    jobForm.addEventListener('submit', handleJobFormSubmit);
  }
  
  // Customization form submission
  const customizationForm = document.getElementById('customizationForm');
  if (customizationForm) {
    customizationForm.addEventListener('submit', handleCustomizationFormSubmit);
  }
  
  // Quick email setup form
  const quickEmailSetupForm = document.getElementById('quickEmailSetupForm');
  if (quickEmailSetupForm) {
    quickEmailSetupForm.addEventListener('submit', handleQuickEmailSetup);
  }
  
  // Color picker synchronization
  setupColorPickers();
  
  // Email preview updates
  setupEmailPreviews();
  
  // Image URL previews
  setupImagePreviews();
  
  // Modal close handlers
  setupModalHandlers();
}

// Handle job form submission
async function handleJobFormSubmit(e) {
  e.preventDefault();
  
  const requirementsString = getRequirementsString();
  const formData = new FormData(e.target);
  const jobData = Object.fromEntries(formData);
  jobData.requirements = requirementsString;
  const jobId = jobData.jobId;
  delete jobData.jobId;
  
  // Convert deadline to ISO format
  if (jobData.deadline) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(jobData.deadline)) {
      jobData.deadline = jobData.deadline + 'T23:59:59';
    }
    jobData.deadline = new Date(jobData.deadline).toISOString();
  }
  
  try {
    const url = jobId ? `/api/admin/jobs/${jobId}` : '/api/admin/jobs';
    const method = jobId ? 'PUT' : 'POST';
    
    const response = await window.makeAuthenticatedRequest(url, {
      method: method,
      body: JSON.stringify(jobData)
    });
    
    if (response.ok) {
      closeJobModal();
      loadJobs();
      alert(jobId ? 'Job updated successfully!' : 'Job created successfully!');
    } else {
      const error = await response.json();
      alert('Failed to save job: ' + (error.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error saving job:', error);
    alert('Error saving job: ' + error.message);
  }
}

// Handle customization form submission
async function handleCustomizationFormSubmit(e) {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const settings = Object.fromEntries(formData);
  
  // Convert checkbox value
  settings.showExampleVideos = formData.has('showExampleVideos');
  
  // Map form fields to database field names
  const mappedSettings = {
    primary_color: settings.primaryColor,
    secondary_color: settings.secondaryColor,
    text_color: settings.textColor,
    accent_color: settings.accentColor,
    hero_image_url: settings.heroImageUrl,
    logo_url: settings.logoUrl,
    logo_size: settings.logoSize,
    heading_font: settings.headingFont,
    body_font: settings.bodyFont,
    jobs_heading: settings.jobsHeading,
    jobs_subheading: settings.jobsSubheading,
    submit_heading: settings.submitHeading,
    submit_subheading: settings.submitSubheading,
    show_example_videos: settings.showExampleVideos,
    example_video_1: settings.exampleVideo1,
    example_video_2: settings.exampleVideo2,
    example_video_3: settings.exampleVideo3,
    example_video_4: settings.exampleVideo4,
    custom_css: settings.customCss
  };
  
  try {
    const response = await window.makeAuthenticatedRequest('/api/admin/customizations', {
      method: 'POST',
      body: JSON.stringify(mappedSettings)
    });
    
    if (response.ok) {
      const successMsg = document.getElementById('customizationSuccessMessage');
      if (successMsg) {
        successMsg.style.display = 'block';
        setTimeout(() => successMsg.style.display = 'none', 3000);
      }
      
      // Reload customizations
      setTimeout(loadCustomizations, 500);
    } else {
      alert('Failed to save settings');
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    alert('Error saving settings');
  }
}

// Handle quick email setup
async function handleQuickEmailSetup(e) {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const emailSettings = Object.fromEntries(formData);
  
  try {
    const response = await window.makeAuthenticatedRequest('/api/admin/email-settings', {
      method: 'POST',
      body: JSON.stringify(emailSettings)
    });
    
    if (response.ok) {
      closeQuickEmailSetup();
      window.location.reload();
    } else {
      const errorData = await response.json();
      alert('Failed to save email settings: ' + (errorData.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error saving email settings:', error);
    alert('Error saving email settings');
  }
}

// Color picker setup
function setupColorPickers() {
  document.querySelectorAll('input[type="color"]').forEach(picker => {
    const textInput = picker.nextElementSibling;
    if (textInput) {
      picker.addEventListener('change', (e) => {
        textInput.value = e.target.value;
      });
    }
  });
  
  document.querySelectorAll('input[type="text"][pattern]').forEach(input => {
    const picker = input.previousElementSibling;
    if (picker && picker.type === 'color') {
      input.addEventListener('input', (e) => {
        if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
          picker.value = e.target.value;
        }
      });
    }
  });
}

// Email preview setup
function setupEmailPreviews() {
  const emailFromName = document.getElementById('emailFromName');
  if (emailFromName) {
    emailFromName.addEventListener('input', function(e) {
      const preview = document.getElementById('fromNamePreview');
      if (preview) {
        preview.textContent = e.target.value || 'Honest UGC';
      }
    });
  }
  
  const emailReplyTo = document.getElementById('emailReplyTo');
  if (emailReplyTo) {
    emailReplyTo.addEventListener('input', function(e) {
      const preview = document.getElementById('replyToPreview');
      if (preview) {
        preview.textContent = e.target.value || 'no replies (emails will be no-reply)';
      }
    });
  }
}

// Image preview setup
function setupImagePreviews() {
  const heroImageUrl = document.getElementById('heroImageUrl');
  if (heroImageUrl) {
    heroImageUrl.addEventListener('input', function() {
      showImagePreview('heroImagePreview', this.value);
    });
  }
  
  const logoUrl = document.getElementById('logoUrl');
  if (logoUrl) {
    logoUrl.addEventListener('input', function() {
      showImagePreview('logoPreview', this.value);
    });
  }
}

// Modal handlers
function setupModalHandlers() {
  window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
      if (event.target.id === 'jobModal') {
        closeJobModal();
      } else if (event.target.id === 'mediaModal') {
        closeModal();
      } else if (event.target.id === 'jobViewModal') {
        closeJobViewModal();
      } else if (event.target.id === 'quickEmailSetupModal') {
        closeQuickEmailSetup();
      }
    }
  };
}

// Tab switching
window.switchTab = function(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(tab + '-tab').classList.add('active');
  
  // Load data for the tab
  if (tab === 'jobs') {
    loadJobs();
  } else if (tab === 'customizations') {
    loadCustomizations();
  } else if (tab === 'email-settings') {
    loadEmailSettings();
  } else if (tab === 'plans') {
    loadPlanInfo();
  } else {
    loadSubmissions();
  }
};

// Load submissions
async function loadSubmissions() {
  try {
    const response = await window.makeAuthenticatedRequest('/api/admin/submissions');
    
    if (!response.ok) {
      throw new Error('Failed to load submissions');
    }
    
    const data = await response.json();
    allSubmissions = data.submissions || [];
    
    // Update stats
    updateSubmissionStats();
    
    // Display submissions
    displaySubmissions();
  } catch (error) {
    console.error('Error loading submissions:', error);
    document.getElementById('submissionsTable').innerHTML = `
      <div class="empty-state">
        <p>Error loading submissions. Please refresh the page.</p>
      </div>
    `;
  }
}

// Update submission statistics
function updateSubmissionStats() {
  document.getElementById('totalCount').textContent = allSubmissions.length;
  
  const pendingCount = allSubmissions.filter(s => 
    s.status === 'pending' || 
    (s.status === 'approved' && (s.reward_type === 'giftcard' || s.reward_type === 'cash') && !s.reward_fulfilled)
  ).length;
  
  const approvedCount = allSubmissions.filter(s => 
    s.status === 'approved' && 
    ((s.reward_type !== 'giftcard' && s.reward_type !== 'cash') || s.reward_fulfilled)
  ).length;
  
  document.getElementById('pendingCount').textContent = pendingCount;
  document.getElementById('approvedCount').textContent = approvedCount;
}

// Display filtered submissions
function displaySubmissions() {
  let filteredSubmissions = filterSubmissionsByStatus();
  
  const tableDiv = document.getElementById('submissionsTable');
  
  if (filteredSubmissions.length === 0) {
    tableDiv.innerHTML = `
      <div class="empty-state">
        <p>No ${currentSubmissionFilter === 'all' ? '' : currentSubmissionFilter} submissions.</p>
      </div>
    `;
    return;
  }
  
  tableDiv.innerHTML = createSubmissionsTable(filteredSubmissions);
  
  // Observe lazy-loaded images
  tableDiv.querySelectorAll('.lazy').forEach(element => {
    window.lazyImageObserver.observe(element);
  });
}

// Filter submissions by status
function filterSubmissionsByStatus() {
  if (currentSubmissionFilter === 'all') {
    return allSubmissions;
  } else if (currentSubmissionFilter === 'pending') {
    return allSubmissions.filter(s => 
      s.status === 'pending' || 
      (s.status === 'approved' && (s.reward_type === 'giftcard' || s.reward_type === 'cash') && !s.reward_fulfilled)
    );
  } else if (currentSubmissionFilter === 'approved') {
    return allSubmissions.filter(s => 
      s.status === 'approved' && 
      ((s.reward_type !== 'giftcard' && s.reward_type !== 'cash') || s.reward_fulfilled)
    );
  } else {
    return allSubmissions.filter(s => s.status === currentSubmissionFilter);
  }
}

// Create submissions table HTML
function createSubmissionsTable(submissions) {
  return `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Date</th>
          <th>Customer</th>
          <th>PayPal Email</th>
          <th>Type</th>
          <th>Job</th>
          <th>Content</th>
          <th>Media</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${submissions.map(sub => createSubmissionRow(sub)).join('')}
      </tbody>
    </table>
  `;
}

// Create individual submission row
function createSubmissionRow(sub) {
  return `
    <tr>
      <td>#${sub.shop_submission_number || sub.id}</td>
      <td>${new Date(sub.createdAt).toLocaleDateString()}</td>
      <td>${sub.customerEmail}</td>
      <td>${sub.paypal_email ? `<a href="mailto:${sub.paypal_email}">${sub.paypal_email}</a>` : '-'}</td>
      <td>${sub.type}</td>
      <td>${sub.job_title ? `<a href="#" onclick="viewJobFromSubmission(event, ${sub.job_id})">${sub.job_title}</a>` : '-'}</td>
      <td class="review-content">${sub.content || 'No content'}</td>
      <td>
        ${sub.mediaUrl ? createMediaPreview(sub) : '-'}
      </td>
      <td>${createSubmissionActions(sub)}</td>
    </tr>
  `;
}

// Create media preview element
function createMediaPreview(sub) {
  if (sub.type === 'video') {
    return `<video class="media-preview lazy" data-src="${sub.mediaUrl}" onclick="openModal('${sub.mediaUrl}', 'video')"></video>`;
  } else {
    return `<img class="media-preview lazy" data-src="${sub.mediaUrl}" onclick="openModal('${sub.mediaUrl}', 'image')" alt="Submission media">`;
  }
}

// Create submission action buttons
function createSubmissionActions(sub) {
  if (sub.status === 'pending') {
    return `
      <button onclick="approveSubmission(${sub.id})" class="btn btn-primary btn-sm">Approve</button>
      <button onclick="rejectSubmission(${sub.id})" class="btn btn-danger btn-sm">Reject</button>
    `;
  }
  
  let actions = `<span class="status-${sub.status}">${sub.status}</span>`;
  
  if (sub.status === 'approved' && sub.reward_type === 'giftcard') {
    actions += `
      <div style="margin-top: 8px;">
        <button onclick="sendGiftCard(${sub.id})" class="btn btn-${sub.reward_fulfilled ? 'secondary' : 'primary'} btn-sm">
          ${sub.reward_fulfilled ? 'Resend' : 'Send'} Gift Card Email
        </button>
      </div>
    `;
  } else if (sub.status === 'approved' && sub.reward_type === 'cash') {
    actions += `
      <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px; align-items: stretch;">
        <input type="text" id="paypalTx_${sub.id}" class="input-sm" placeholder="PayPal Transaction ID" value="${sub.reward_paypal_transaction_id ? sub.reward_paypal_transaction_id : ''}" style="min-width: 180px;">
        <button onclick="markCashFulfilled(${sub.id})" class="btn btn-${sub.reward_fulfilled ? 'secondary' : 'primary'} btn-sm" style="width: auto;">
          ${sub.reward_fulfilled ? 'Update' : 'Mark'} Transaction ID
        </button>
      </div>
    `;
  } else if (sub.status === 'approved' && sub.reward_type) {
    actions += `
      <div style="margin-top: 8px;">
        <button onclick="resendRewardEmail(${sub.id})" class="btn btn-secondary btn-sm">Resend Reward Email</button>
      </div>
    `;
  } else if (sub.status === 'rejected') {
    actions += `
      <div style="margin-top: 8px;">
        <button onclick="resendRejectionEmail(${sub.id})" class="btn btn-secondary btn-sm">Resend Rejection Email</button>
      </div>
    `;
  }
  
  return actions;
}

// Filter submissions
window.filterSubmissions = function(filter) {
  currentSubmissionFilter = filter;
  
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  
  displaySubmissions();
};

// Approve submission
window.approveSubmission = async function(submissionId) {
  if (!confirm('Are you sure you want to approve this submission? This will trigger any associated rewards.')) {
    return;
  }
  
  try {
    const response = await window.makeAuthenticatedRequest(`/api/admin/submissions/${submissionId}/approve`, {
      method: 'POST'
    });
    
    if (response.ok) {
      alert('Submission approved successfully!');
      loadSubmissions();
    } else {
      const data = await response.json();
      alert(data.message || 'Failed to approve submission');
      if (data.keepPending) {
        loadSubmissions();
      }
    }
  } catch (error) {
    console.error('Error approving submission:', error);
    alert('Error approving submission');
  }
};

// Reject submission
window.rejectSubmission = async function(submissionId) {
  if (!confirm('Are you sure you want to reject this submission?')) {
    return;
  }
  
  try {
    const response = await window.makeAuthenticatedRequest(`/api/admin/submissions/${submissionId}/reject`, {
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
};

// Send gift card
window.sendGiftCard = async function(submissionId) {
  const code = prompt('Enter the gift card code:');
  const amount = prompt('Enter the gift card amount (numbers only):');
  
  if (!code || !amount) {
    alert('Gift card code and amount are required');
    return;
  }
  
  try {
    const response = await window.makeAuthenticatedRequest(`/api/admin/rewards/${submissionId}/send-giftcard`, {
      method: 'POST',
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
};

// Resend rejection email
window.resendRejectionEmail = async function(submissionId) {
  if (!confirm('Are you sure you want to resend the rejection email?')) {
    return;
  }
  
  try {
    const response = await window.makeAuthenticatedRequest(`/api/admin/submissions/${submissionId}/resend-rejection`, {
      method: 'POST'
    });
    
    if (response.ok) {
      alert('Rejection email resent successfully!');
    } else {
      const data = await response.json();
      alert('Failed to resend rejection email: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error resending rejection email:', error);
    alert('Error resending rejection email');
  }
};

// Resend reward email
window.resendRewardEmail = async function(submissionId) {
  if (!confirm('Are you sure you want to resend the reward email?')) {
    return;
  }
  
  try {
    const response = await window.makeAuthenticatedRequest(`/api/admin/submissions/${submissionId}/resend-reward`, {
      method: 'POST'
    });
    
    if (response.ok) {
      alert('Reward email resent successfully!');
    } else {
      const data = await response.json();
      alert('Failed to resend reward email: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error resending reward email:', error);
    alert('Error resending reward email');
  }
};

// Load jobs
async function loadJobs() {
  try {
    const response = await window.makeAuthenticatedRequest('/api/admin/jobs');
    
    if (!response.ok) {
      throw new Error('Failed to load jobs');
    }
    
    const data = await response.json();
    currentJobs = data.jobs || [];
    
    updateJobStats();
    displayJobs();
  } catch (error) {
    console.error('Error loading jobs:', error);
    document.getElementById('jobsList').innerHTML = `
      <div class="empty-state">
        <p>Error loading jobs. Please refresh the page.</p>
      </div>
    `;
  }
}

// Update job statistics
function updateJobStats() {
  document.getElementById('totalJobs').textContent = currentJobs.length;
  document.getElementById('activeJobs').textContent = currentJobs.filter(j => j.status === 'active').length;
  document.getElementById('completedJobs').textContent = currentJobs.filter(j => j.status === 'completed').length;
}

// Display jobs
function displayJobs() {
  const jobsList = document.getElementById('jobsList');
  
  if (currentJobs.length === 0) {
    jobsList.innerHTML = `
      <div class="empty-state">
        <p>No jobs created yet.</p>
        <p>Create your first job to start receiving targeted UGC!</p>
      </div>
    `;
    return;
  }
  
  jobsList.innerHTML = currentJobs.map(job => createJobCard(job)).join('');
}

// Create job card HTML
function createJobCard(job) {
  return `
    <div class="job-card">
      <div class="job-info">
        <h3 onclick="viewJobDetails(${job.id})">${job.title}</h3>
        <div class="job-meta">
          <span>Type: ${job.type}</span>
          <span>Spots: ${job.spots_filled}/${job.spots_available}</span>
          <span>Reward: ${formatReward(job)}</span>
          ${job.deadline ? `<span>Deadline: ${new Date(job.deadline).toLocaleDateString()}</span>` : ''}
        </div>
      </div>
      <div class="job-actions">
        <span class="job-status status-${job.status}">${job.status}</span>
        <button class="btn btn-sm btn-secondary" onclick="openJobModal(${job.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteJob(${job.id})">Delete</button>
      </div>
    </div>
  `;
}

// Format reward display
function formatReward(job) {
  if (job.reward_type === 'percentage') {
    return job.reward_value + '% off';
  } else if (job.reward_type === 'fixed') {
    return '$' + job.reward_value + ' off';
  } else if (job.reward_type === 'giftcard') {
    return '$' + job.reward_giftcard_amount + ' gift card';
  } else if (job.reward_type === 'cash') {
    return '$' + (job.reward_cash_amount || job.reward_value || 0) + ' cash';
  } else {
    return 'Free ' + (job.reward_product || 'product');
  }
}

// Job modal functions
window.openJobModal = function(jobId = null) {
  editingJobId = jobId;
  
  if (jobId) {
    document.getElementById('modalTitle').textContent = 'Edit UGC Job';
    document.getElementById('submitJobBtn').textContent = 'Update Job';
    document.getElementById('statusGroup').style.display = 'block';
    
    const job = currentJobs.find(j => j.id === jobId);
    if (job) {
      populateJobForm(job);
    }
  } else {
    document.getElementById('modalTitle').textContent = 'Create New UGC Job';
    document.getElementById('submitJobBtn').textContent = 'Create Job';
    document.getElementById('statusGroup').style.display = 'none';
    document.getElementById('jobForm').reset();
    document.getElementById('jobId').value = '';
    setRequirementsFromString('');
    updateRewardFields();
  }
  
  document.getElementById('jobModal').classList.add('open');
};

// Populate job form with existing data
function populateJobForm(job) {
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
  const cashEl = document.getElementById('rewardCashAmount');
  if (cashEl) {
    cashEl.value = job.reward_cash_amount || '';
  }
  
  if (job.reward_type === 'product' && job.reward_product) {
    populateProductInfo(job);
  }
  
  document.getElementById('deadline').value = job.deadline ? new Date(job.deadline).toISOString().slice(0, 10) : '';
  document.getElementById('exampleContent').value = job.example_content || '';
  document.getElementById('status').value = job.status;
  
  updateRewardFields();
}

// Populate product info when editing
function populateProductInfo(job) {
  document.getElementById('rewardProduct').value = job.reward_product;
  document.getElementById('rewardProductId').value = job.reward_product_id || '';
  document.getElementById('rewardProductHandle').value = job.reward_product_handle || '';
  
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

window.closeJobModal = function() {
  document.getElementById('jobModal').classList.remove('open');
  document.getElementById('jobForm').reset();
  editingJobId = null;
};

window.updateRewardFields = function() {
  const rewardType = document.getElementById('rewardType').value;
  const valueGroup = document.getElementById('rewardValueGroup');
  const productGroup = document.getElementById('rewardProductGroup');
  const giftCardGroup = document.getElementById('rewardGiftCardGroup');
  let cashGroup = document.getElementById('rewardCashGroup');
  if (!cashGroup) {
    // Create cash group on the fly if not present (defensive)
    const container = valueGroup.parentElement;
    cashGroup = document.createElement('div');
    cashGroup.className = 'form-group';
    cashGroup.id = 'rewardCashGroup';
    cashGroup.style.display = 'none';
    cashGroup.innerHTML = `
      <label for="rewardCashAmount">Cash Amount*</label>
      <input type="number" id="rewardCashAmount" name="rewardCashAmount" min="1" placeholder="Amount in $">
    `;
    container.appendChild(cashGroup);
  }
  
  if (rewardType === 'product') {
    valueGroup.style.display = 'none';
    productGroup.style.display = 'block';
    giftCardGroup.style.display = 'none';
    cashGroup.style.display = 'none';
    document.getElementById('rewardValue').required = false;
    document.getElementById('rewardProduct').required = true;
    document.getElementById('rewardGiftCardAmount').required = false;
    document.getElementById('rewardCashAmount') && (document.getElementById('rewardCashAmount').required = false);
  } else if (rewardType === 'giftcard') {
    valueGroup.style.display = 'none';
    productGroup.style.display = 'none';
    giftCardGroup.style.display = 'block';
    cashGroup.style.display = 'none';
    document.getElementById('rewardValue').required = false;
    document.getElementById('rewardProduct').required = false;
    document.getElementById('rewardGiftCardAmount').required = true;
    document.getElementById('rewardCashAmount') && (document.getElementById('rewardCashAmount').required = false);
    clearProductSelection();
  } else if (rewardType === 'cash') {
    // Check if plan allows cash (via disabled option state set by loadPlanInfo)
    const rewardTypeSelect = document.getElementById('rewardType');
    const cashOption = Array.from(rewardTypeSelect.options).find(o => o.value === 'cash');
    const cashAllowed = cashOption && !cashOption.disabled;
    if (!cashAllowed) {
      // Fallback to percentage if not allowed
      rewardTypeSelect.value = 'percentage';
      valueGroup.style.display = 'block';
      productGroup.style.display = 'none';
      giftCardGroup.style.display = 'none';
      cashGroup.style.display = 'none';
      document.getElementById('rewardValue').required = true;
      document.getElementById('rewardProduct').required = false;
      document.getElementById('rewardGiftCardAmount').required = false;
      document.getElementById('rewardCashAmount') && (document.getElementById('rewardCashAmount').required = false);
    } else {
      valueGroup.style.display = 'none';
      productGroup.style.display = 'none';
      giftCardGroup.style.display = 'none';
      cashGroup.style.display = 'block';
      document.getElementById('rewardValue').required = false;
      document.getElementById('rewardProduct').required = false;
      document.getElementById('rewardGiftCardAmount').required = false;
      document.getElementById('rewardCashAmount').required = true;
      clearProductSelection();
    }
  } else {
    valueGroup.style.display = 'block';
    productGroup.style.display = 'none';
    giftCardGroup.style.display = 'none';
    cashGroup.style.display = 'none';
    document.getElementById('rewardValue').required = true;
    document.getElementById('rewardProduct').required = false;
    document.getElementById('rewardGiftCardAmount').required = false;
    document.getElementById('rewardCashAmount') && (document.getElementById('rewardCashAmount').required = false);
    const label = rewardType === 'percentage' ? 'Discount Percentage' : 'Amount Off ($)';
    valueGroup.querySelector('label').textContent = label + '*';
    clearProductSelection();
  }
};

// Clear product selection
window.clearProductSelection = function() {
  document.getElementById('rewardProduct').value = '';
  document.getElementById('rewardProductId').value = '';
  document.getElementById('rewardProductHandle').value = '';
  document.getElementById('selectedProductInfo').style.display = 'none';
};

// Delete job
window.deleteJob = async function(jobId) {
  if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
    return;
  }
  
  try {
    const response = await window.makeAuthenticatedRequest(`/api/admin/jobs/${jobId}`, {
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
};

// View job details
window.viewJobDetails = function(jobId) {
  const job = currentJobs.find(j => j.id === jobId);
  if (!job) return;
  
  populateJobViewModal(job);
  document.getElementById('jobViewModal').classList.add('open');
};

// Populate job view modal
function populateJobViewModal(job) {
  document.getElementById('viewJobTitle').textContent = job.title;
  document.getElementById('viewJobDescription').textContent = job.description;
  
  // Display requirements
  const requirementsElement = document.getElementById('viewJobRequirements');
  if (job.requirements) {
    const requirements = job.requirements.split('\n').filter(r => r.trim());
    if (requirements.length > 0) {
      requirementsElement.innerHTML = '<ul style="margin: 5px 0; padding-left: 20px;">' + 
        requirements.map(req => `<li>${req}</li>`).join('') + 
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
  const urlParams = new URLSearchParams(window.location.search);
  const shop = urlParams.get('shop');
  const jobLink = shop ? `${HOST}/submit?jobId=${job.id}&shop=${encodeURIComponent(shop)}` : `${HOST}/submit?jobId=${job.id}`;
  document.getElementById('viewJobLink').href = jobLink;
  document.getElementById('viewJobLink').textContent = jobLink;
  
  // Set up the edit button
  document.getElementById('editFromViewBtn').onclick = function() {
    closeJobViewModal();
    openJobModal(job.id);
  };
}

window.closeJobViewModal = function() {
  document.getElementById('jobViewModal').classList.remove('open');
};

// View job from submission
window.viewJobFromSubmission = async function(event, jobId) {
  event.preventDefault();
  
  // If we don't have job data, load it
  if (!currentJobs || currentJobs.length === 0) {
    try {
      const response = await window.makeAuthenticatedRequest('/api/admin/jobs');
      if (response.ok) {
        const data = await response.json();
        currentJobs = data.jobs || [];
      } else {
        alert('Failed to load job details');
        return;
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
      alert('Failed to load job details');
      return;
    }
  }
  
  viewJobDetails(jobId);
};

// Requirements management
window.addRequirement = function() {
  const requirementsList = document.getElementById('requirementsList');
  const newItem = document.createElement('li');
  newItem.className = 'requirement-item';
  newItem.innerHTML = `
    <input type="text" class="requirement-input" placeholder="Enter requirement">
    <button type="button" class="btn-remove" onclick="removeRequirement(this)">Remove</button>
  `;
  requirementsList.appendChild(newItem);
};

window.removeRequirement = function(button) {
  const requirementsList = document.getElementById('requirementsList');
  if (requirementsList.children.length > 1) {
    button.parentElement.remove();
  }
};

function getRequirementsString() {
  const inputs = document.querySelectorAll('.requirement-input');
  const requirements = Array.from(inputs)
    .map(input => input.value.trim())
    .filter(value => value !== '');
  return requirements.join('\n');
}

function setRequirementsFromString(requirementsString) {
  const requirementsList = document.getElementById('requirementsList');
  requirementsList.innerHTML = '';
  
  if (requirementsString) {
    const requirements = requirementsString.split('\n').filter(r => r.trim());
    requirements.forEach(req => {
      const newItem = document.createElement('li');
      newItem.className = 'requirement-item';
      newItem.innerHTML = `
        <input type="text" class="requirement-input" value="${req}" placeholder="Enter requirement">
        <button type="button" class="btn-remove" onclick="removeRequirement(this)">Remove</button>
      `;
      requirementsList.appendChild(newItem);
    });
  }
  
  if (requirementsList.children.length === 0) {
    addRequirement();
  }
}

// Load customizations
async function loadCustomizations() {
  try {
    const response = await window.makeAuthenticatedRequest('/api/admin/customizations');
    
    if (!response.ok) {
      throw new Error('Failed to load customizations');
    }
    
    const customizations = await response.json();
    populateCustomizationForm(customizations);
    customizationsLoaded = true;
  } catch (error) {
    console.error('Error loading customizations:', error);
  }
}

// Populate customization form
function populateCustomizationForm(customizations) {
  // Colors
  if (customizations.primary_color) {
    document.getElementById('primaryColor').value = customizations.primary_color;
    document.getElementById('primaryColorPicker').value = customizations.primary_color;
  }
  if (customizations.secondary_color) {
    document.getElementById('secondaryColor').value = customizations.secondary_color;
    document.getElementById('secondaryColorPicker').value = customizations.secondary_color;
  }
  if (customizations.text_color) {
    document.getElementById('textColor').value = customizations.text_color;
    document.getElementById('textColorPicker').value = customizations.text_color;
  }
  if (customizations.accent_color) {
    document.getElementById('accentColor').value = customizations.accent_color;
    document.getElementById('accentColorPicker').value = customizations.accent_color;
  }
  
  // Images
  if (customizations.hero_image_url) {
    document.getElementById('heroImageUrl').value = customizations.hero_image_url;
    showImagePreview('heroImagePreview', customizations.hero_image_url);
  }
  if (customizations.logo_url) {
    document.getElementById('logoUrl').value = customizations.logo_url;
    showImagePreview('logoPreview', customizations.logo_url);
  }
  if (customizations.logo_size) {
    document.getElementById('logoSize').value = customizations.logo_size;
  }
  
  // Typography
  if (customizations.heading_font) {
    document.getElementById('headingFont').value = customizations.heading_font;
  }
  if (customizations.body_font) {
    document.getElementById('bodyFont').value = customizations.body_font;
  }
  
  // Page Headings
  if (customizations.jobs_heading) {
    document.getElementById('jobsHeading').value = customizations.jobs_heading;
  }
  if (customizations.jobs_subheading) {
    document.getElementById('jobsSubheading').value = customizations.jobs_subheading;
  }
  if (customizations.submit_heading) {
    document.getElementById('submitHeading').value = customizations.submit_heading;
  }
  if (customizations.submit_subheading) {
    document.getElementById('submitSubheading').value = customizations.submit_subheading;
  }
  
  // Example Videos
  if (customizations.show_example_videos !== undefined) {
    document.getElementById('showExampleVideos').checked = customizations.show_example_videos;
  }
  if (customizations.example_video_1) {
    document.getElementById('exampleVideo1').value = customizations.example_video_1;
  }
  if (customizations.example_video_2) {
    document.getElementById('exampleVideo2').value = customizations.example_video_2;
  }
  if (customizations.example_video_3) {
    document.getElementById('exampleVideo3').value = customizations.example_video_3;
  }
  if (customizations.example_video_4) {
    document.getElementById('exampleVideo4').value = customizations.example_video_4;
  }
  
  // Custom CSS
  if (customizations.custom_css) {
    document.getElementById('customCss').value = customizations.custom_css;
  }
}

// Show image preview
function showImagePreview(previewId, imageUrl) {
  const preview = document.getElementById(previewId);
  if (imageUrl) {
    preview.src = imageUrl;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
}

window.resetCustomizationsToDefaults = function() {
  // Colors
  document.getElementById('primaryColor').value = '#d4b896';
  document.getElementById('primaryColorPicker').value = '#d4b896';
  document.getElementById('secondaryColor').value = '#f8f6f3';
  document.getElementById('secondaryColorPicker').value = '#f8f6f3';
  document.getElementById('textColor').value = '#3a3a3a';
  document.getElementById('textColorPicker').value = '#3a3a3a';
  document.getElementById('accentColor').value = '#c9a961';
  document.getElementById('accentColorPicker').value = '#c9a961';
  
  // Images
  document.getElementById('heroImageUrl').value = '';
  document.getElementById('logoUrl').value = '';
  document.getElementById('logoSize').value = 'medium';
  document.getElementById('heroImagePreview').style.display = 'none';
  document.getElementById('logoPreview').style.display = 'none';
  
  // Typography
  document.getElementById('headingFont').value = 'Montserrat';
  document.getElementById('bodyFont').value = 'Inter';
  
  // Page Headings
  document.getElementById('jobsHeading').value = '';
  document.getElementById('jobsSubheading').value = '';
  document.getElementById('submitHeading').value = '';
  document.getElementById('submitSubheading').value = '';
  
  // Example Videos
  document.getElementById('showExampleVideos').checked = true;
  document.getElementById('exampleVideo1').value = '';
  document.getElementById('exampleVideo2').value = '';
  document.getElementById('exampleVideo3').value = '';
  document.getElementById('exampleVideo4').value = '';
  
  // Custom CSS
  document.getElementById('customCss').value = '';
};

// Load email settings
async function loadEmailSettings() {
  try {
    const response = await window.makeAuthenticatedRequest('/api/admin/customizations');
    
    if (!response.ok) {
      throw new Error('Failed to load email settings');
    }
    
    const customizations = await response.json();
    populateEmailSettings(customizations);
  } catch (error) {
    console.error('Error loading email settings:', error);
  }
}

// Populate email settings form
function populateEmailSettings(customizations) {
  const fieldMappings = {
    'email_subject_confirmation': 'emailSubjectConfirmation',
    'email_body_confirmation': 'emailBodyConfirmation',
    'email_subject_rejected': 'emailSubjectRejected',
    'email_body_rejected': 'emailBodyRejected',
    'email_subject_reward': 'emailSubjectReward',
    'email_body_reward': 'emailBodyReward',
    'email_subject_giftcard': 'emailSubjectGiftcard',
    'email_body_giftcard': 'emailBodyGiftcard',
    'email_subject_product': 'emailSubjectProduct',
    'email_body_product': 'emailBodyProduct',
    'email_from_name': 'emailFromName',
    'email_reply_to': 'emailReplyTo',
    'notification_email': 'notificationEmail'
  };
  
  for (const [dbField, formField] of Object.entries(fieldMappings)) {
    const element = document.getElementById(formField);
    if (element && customizations[dbField]) {
      element.value = customizations[dbField];
    }
  }
  
  // Update previews
  if (customizations.email_from_name) {
    document.getElementById('fromNamePreview').textContent = customizations.email_from_name;
  }
  if (customizations.email_reply_to) {
    document.getElementById('replyToPreview').textContent = customizations.email_reply_to;
  }
}

// Save email settings with validation
window.saveEmailSettings = async function() {
  const form = document.getElementById('emailSettingsForm');
  
  // Get required fields
  const emailFromName = document.getElementById('emailFromName');
  const notificationEmail = document.getElementById('notificationEmail');
  
  // Validate required fields
  if (!emailFromName.value.trim()) {
    alert('Please enter a From Name. This field is required.');
    emailFromName.focus();
    return;
  }
  
  if (!notificationEmail.value.trim()) {
    alert('Please enter a Notification Email Address. This field is required.');
    notificationEmail.focus();
    return;
  }
  
  // Validate email format for notification email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(notificationEmail.value.trim())) {
    alert('Please enter a valid email address for notifications.');
    notificationEmail.focus();
    return;
  }
  
  // Validate reply-to email if provided
  const replyToEmail = document.getElementById('emailReplyTo');
  if (replyToEmail.value.trim() && !emailRegex.test(replyToEmail.value.trim())) {
    alert('Please enter a valid Reply-To email address or leave it empty.');
    replyToEmail.focus();
    return;
  }
  
  const formData = new FormData(form);
  const emailSettings = Object.fromEntries(formData);
  
  try {
    const response = await window.makeAuthenticatedRequest('/api/admin/email-settings', {
      method: 'POST',
      body: JSON.stringify(emailSettings)
    });
    
    if (response.ok) {
      document.getElementById('emailSettingsSuccessMessage').style.display = 'block';
      setTimeout(() => {
        document.getElementById('emailSettingsSuccessMessage').style.display = 'none';
      }, 3000);
      
      // Check if email setup is now complete
      const emailFromNameValue = document.getElementById('emailFromName').value.trim();
      const notificationEmailValue = document.getElementById('notificationEmail').value.trim();
      
      if (emailFromNameValue && notificationEmailValue) {
        const banner = document.getElementById('emailSetupBanner');
        if (banner) {
          banner.style.display = 'none';
        }
      }
    } else {
      const errorData = await response.json();
      alert('Failed to save email settings: ' + (errorData.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error saving email settings:', error);
    alert('Error saving email settings');
  }
};

window.resetEmailSettingsToDefaults = function() {
  const fields = [
    'emailSubjectConfirmation',
    'emailBodyConfirmation',
    'emailSubjectRejected',
    'emailBodyRejected',
    'emailSubjectReward',
    'emailBodyReward',
    'emailSubjectGiftcard',
    'emailBodyGiftcard',
    'emailSubjectProduct',
    'emailBodyProduct',
    'emailFromName',
    'emailReplyTo',
    'notificationEmail'
  ];
  
  fields.forEach(field => {
    const element = document.getElementById(field);
    if (element) {
      element.value = '';
    }
  });
  
  document.getElementById('fromNamePreview').textContent = 'Honest UGC';
  document.getElementById('replyToPreview').textContent = 'no replies (emails will be no-reply)';
};

// Modal functions
let currentMediaUrl = '';
let currentMediaType = '';

window.openModal = function(src, type) {
  const modal = document.getElementById('mediaModal');
  const modalImg = document.getElementById('modalImage');
  const modalVideo = document.getElementById('modalVideo');
  
  // Store current media info for download
  currentMediaUrl = src;
  currentMediaType = type;
  
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
};

window.closeModal = function() {
  const modal = document.getElementById('mediaModal');
  const modalVideo = document.getElementById('modalVideo');
  modal.classList.remove('open');
  modalVideo.pause();
  modalVideo.src = '';
  
  // Clear current media info
  currentMediaUrl = '';
  currentMediaType = '';
};

// Download current media function
window.downloadCurrentMedia = async function() {
  if (!currentMediaUrl) {
    alert('No media to download');
    return;
  }
  
  // Extract filename from URL or create a default one
  const urlParts = currentMediaUrl.split('/');
  const filename = urlParts[urlParts.length - 1] || `submission-media.${currentMediaType === 'video' ? 'mp4' : 'jpg'}`;
  
  // Create a temporary link and trigger download
  const link = document.createElement('a');
  link.href = currentMediaUrl;
  link.download = filename;
  link.target = '_blank';
  
  // Add to DOM temporarily, click, then remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.openQuickEmailSetup = function() {
  document.getElementById('quickEmailSetupModal').classList.add('open');
};

window.closeQuickEmailSetup = function() {
  document.getElementById('quickEmailSetupModal').classList.remove('open');
};

// Session health monitoring
function startSessionHealthCheck() {
  // Check session health every 5 minutes
  setInterval(async () => {
    try {
      const isHealthy = await window.checkSessionHealth();
      if (!isHealthy) {
        console.log('Session unhealthy, refreshing...');
        window.location.reload();
      }
    } catch (error) {
      console.error('Session health check error:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
}

// Mark cash reward fulfilled
window.markCashFulfilled = async function(submissionId) {
  const tx = document.getElementById(`paypalTx_${submissionId}`).value.trim();
  if (!tx) {
    alert('Please enter the PayPal Transaction ID');
    return;
  }
  try {
    const response = await window.makeAuthenticatedRequest(`/api/admin/rewards/${submissionId}/cash-fulfill`, {
      method: 'POST',
      body: JSON.stringify({ transactionId: tx })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to mark cash fulfilled');
    }
    alert('Marked as fulfilled');
    loadSubmissions();
  } catch (e) {
    console.error(e);
    alert('Error: ' + e.message);
  }
};

// Plans UI
async function loadPlanInfo() {
  try {
    const resp = await window.makeAuthenticatedRequest('/api/admin/me');
    if (!resp.ok) return;
    const data = await resp.json();
    const current = data.plan || 'starter';
    const banner = document.getElementById('currentPlanBanner');
    if (banner) {
      banner.textContent = `Current plan: ${current.toUpperCase()}`;
    }
    // Hide cash reward type for non-pro plans
    const allowCash = !!(data.features && data.features.rewards && data.features.rewards.cash);
    const rewardTypeSelect = document.getElementById('rewardType');
    if (rewardTypeSelect) {
      const cashOption = Array.from(rewardTypeSelect.options).find(o => o.value === 'cash');
      if (cashOption) {
        cashOption.disabled = !allowCash;
        if (!allowCash && rewardTypeSelect.value === 'cash') {
          rewardTypeSelect.value = 'percentage';
          updateRewardFields();
        }
      }
    }
  } catch (e) {
    console.error('Failed to load plan info', e);
  }
}

window.startSubscription = async function(plan) {
  try {
    const resp = await window.makeAuthenticatedRequest('/api/admin/billing/subscribe', {
      method: 'POST',
      body: JSON.stringify({ plan })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Failed to start subscription');
    // Top-level redirect to confirmation
    window.top.location.href = data.confirmationUrl;
  } catch (e) {
    console.error('Subscription error', e);
    alert('Failed to start subscription: ' + e.message);
  }
};