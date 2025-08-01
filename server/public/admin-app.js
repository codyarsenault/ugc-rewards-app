// This should be at the TOP of your admin-app.js file

console.log('Starting app initialization...');

// Enhanced App Bridge initialization
console.log('Checking for waitForAppBridge function...');
console.log('waitForAppBridge exists:', !!window.waitForAppBridge);

if (window.waitForAppBridge) {
  console.log('Calling waitForAppBridge...');
  window.waitForAppBridge(() => {
    console.log('App Bridge ready, initializing app...');
    initializeRestOfApp();
  });
} else {
  console.log('App Bridge not available, initializing without it...');
  initializeRestOfApp();
}

function initializeRestOfApp() {
  console.log('=== INITIALIZING REST OF APP ===');
  console.log('Initializing rest of app...');
  
  // Add lazy loading for images
  const lazyImageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        lazyImageObserver.unobserve(img);
      }
    });
  });

  // Make lazyImageObserver globally available
  window.lazyImageObserver = lazyImageObserver;

  // Define all global variables
  window.editingJobId = null;
  window.currentJobs = [];
  window.allSubmissions = [];
  window.currentSubmissionFilter = 'pending';
  window.customizationsLoaded = false;

  // Define all your global functions
  window.clearProductSelection = clearProductSelection;
  window.switchTab = switchTab;
  window.openJobModal = openJobModal;
  window.closeJobModal = closeJobModal;
  window.updateRewardFields = updateRewardFields;
  window.loadJobs = loadJobs;
  window.deleteJob = deleteJob;
  window.viewJobDetails = viewJobDetails;
  window.closeJobViewModal = closeJobViewModal;
  window.viewJobFromSubmission = viewJobFromSubmission;
  window.formatReward = formatReward;
  window.loadSubmissions = loadSubmissions;
  window.displaySubmissions = displaySubmissions;
  window.filterSubmissions = filterSubmissions;
  window.approveSubmission = approveSubmission;
  window.rejectSubmission = rejectSubmission;
  window.sendGiftCard = sendGiftCard;
  window.resendRejectionEmail = resendRejectionEmail;
  window.resendRewardEmail = resendRewardEmail;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.addRequirement = addRequirement;
  window.removeRequirement = removeRequirement;
  window.getRequirementsString = getRequirementsString;
  window.setRequirementsFromString = setRequirementsFromString;
  window.loadCustomizations = loadCustomizations;
  window.showImagePreview = showImagePreview;
  window.resetCustomizationsToDefaults = resetCustomizationsToDefaults;
  window.loadEmailSettings = loadEmailSettings;
  window.openQuickEmailSetup = openQuickEmailSetup;
  window.closeQuickEmailSetup = closeQuickEmailSetup;
  
  // Keep all your existing function definitions here...
  // [All your functions like clearProductSelection, switchTab, etc.]
  
  // Set up event listeners at the end
  setupEventListeners();
  
  // Load initial data
  console.log('About to load submissions...');
  loadSubmissions();
  console.log('About to load email settings...');
  loadEmailSettings();
  
  // Start session health monitoring
  if (window.startSessionHealthCheck) {
    console.log('Starting session health check...');
    window.startSessionHealthCheck();
  }
}

function setupEventListeners() {
  // Job form submission
  const jobForm = document.getElementById('jobForm');
  if (jobForm) {
    jobForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      // Your existing job form submission code
      const requirementsString = getRequirementsString();
      
      const formData = new FormData(e.target);
      const jobData = Object.fromEntries(formData);
      jobData.requirements = requirementsString;
      const jobId = jobData.jobId;
      delete jobData.jobId;
      
      // Convert deadline to end of day ISO format if provided
      if (jobData.deadline) {
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
        
        const response = await makeAuthenticatedRequest(url, {
          method: method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(jobData)
        });
        
        if (!response) return; // Redirecting to auth
        
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
  }

  // Color picker synchronization
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

  // Image preview on URL change
  const heroImageUrl = document.getElementById('heroImageUrl');
  if (heroImageUrl) {
    heroImageUrl.addEventListener('input', function() {
      if (this.value) {
        showImagePreview('heroImagePreview', this.value);
      } else {
        const preview = document.getElementById('heroImagePreview');
        if (preview) preview.style.display = 'none';
      }
    });
  }

  const logoUrl = document.getElementById('logoUrl');
  if (logoUrl) {
    logoUrl.addEventListener('input', function() {
      if (this.value) {
        showImagePreview('logoPreview', this.value);
      } else {
        const preview = document.getElementById('logoPreview');
        if (preview) preview.style.display = 'none';
      }
    });
  }

  // Customization form submission
  const customizationForm = document.getElementById('customizationForm');
  if (customizationForm) {
    customizationForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const formData = new FormData(this);
      const settings = Object.fromEntries(formData);
      settings.showExampleVideos = formData.has('showExampleVideos');
      
      try {
        const queryParams = window.location.search;
        const response = await makeAuthenticatedRequest('/api/admin/customizations' + queryParams, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(settings),
        });
        
        if (!response) return; // Redirecting to auth
        
        if (response.ok) {
          const successMsg = document.getElementById('customizationSuccessMessage');
          if (successMsg) {
            successMsg.style.display = 'block';
            setTimeout(() => {
              successMsg.style.display = 'none';
            }, 3000);
          }
          
          // Force reload customizations to ensure consistency across tabs
          setTimeout(() => {
            loadCustomizations();
          }, 500);
        } else {
          alert('Failed to save settings');
        }
      } catch (error) {
        console.error('Error saving settings:', error);
        alert('Error saving settings');
      }
    });
  }

  // Quick Email Setup form submission
  const quickEmailSetupForm = document.getElementById('quickEmailSetupForm');
  if (quickEmailSetupForm) {
    quickEmailSetupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData(e.target);
      const emailSettings = Object.fromEntries(formData);
      
      try {
        const queryParams = window.location.search;
        const response = await makeAuthenticatedRequest('/api/admin/email-settings' + queryParams, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailSettings)
        });
        
        if (!response) return; // Redirecting to auth
        
        if (response.ok) {
          // Close modal and reload page to hide the banner
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
    });
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
      } else if (event.target.id === 'quickEmailSetupModal') {
        closeQuickEmailSetup();
      }
    }
  };
}

// Remove any calls to initializeApp at the bottom of the file
// The initialization happens automatically at the top now

// Update openProductPicker to use shopify.resourcePicker directly
window.openProductPicker = function() {
  console.log('Opening product picker...');
  
  // In embedded context, use shopify.resourcePicker directly
  if (window.shopify && window.shopify.resourcePicker) {
    console.log('Using shopify.resourcePicker');
    
    window.shopify.resourcePicker.open({
      resourceType: 'Product',
      selectMultiple: false,
      showVariants: false
    }).then((result) => {
      console.log('Resource picker result:', result);
      
      if (result && result.length > 0) {
        const product = result[0];
        
        document.getElementById('rewardProduct').value = product.title;
        document.getElementById('rewardProductId').value = product.id;
        document.getElementById('rewardProductHandle').value = product.handle;
        
        const productInfo = document.getElementById('selectedProductInfo');
        productInfo.style.display = 'block';
        
        const productImage = document.getElementById('productImage');
        if (product.images && product.images.length > 0) {
          productImage.src = product.images[0].originalSrc;
          productImage.alt = product.title;
        } else {
          productImage.src = '';
        }
        
        document.getElementById('productTitle').textContent = product.title;
        
        if (product.variants && product.variants.length > 0) {
          const price = product.variants[0].price;
          document.getElementById('productPrice').textContent = '$' + price;
        }
      }
    }).catch((error) => {
      console.error('Resource picker error:', error);
    });
  } else {
    console.error('shopify.resourcePicker not available');
    alert('Product picker not available. Please refresh the page and try again.');
  }
};

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

// This duplicate event listener has been removed - the job form submission is now handled in setupEventListeners()

let currentJobs = [];

// Load Jobs
async function loadJobs() {
  const sessionValid = await checkSessionAndHandleAuth();
  if (!sessionValid) return;
  
  try {
    const queryParams = window.location.search;
    const response = await makeAuthenticatedRequest('/api/admin/jobs' + queryParams);
    if (!response) return; // Redirecting to auth
    
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
      jobsList.innerHTML = `
        <div class="empty-state">
          <p>No jobs created yet.</p>
          <p>Create your first job to start receiving targeted UGC!</p>
        </div>
      `;
    } else {
      jobsList.innerHTML = currentJobs.map(job => `
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
      `).join('');
    }
  } catch (error) {
    console.error('Error loading jobs:', error);
    document.getElementById('jobsList').innerHTML = `
      <div class="empty-state">
        <p>Error loading jobs. Please refresh the page.</p>
      </div>
    `;
  }
}

// Delete job
async function deleteJob(jobId) {
  if (!confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
    return;
  }
  
  try {
    const queryParams = window.location.search;
    const response = await makeAuthenticatedRequest('/api/admin/jobs/' + jobId + queryParams, {
      method: 'DELETE'
    });
    
    if (!response) return; // Redirecting to auth
    
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
  
  document.getElementById('viewJobTitle').textContent = job.title;
  document.getElementById('viewJobDescription').textContent = job.description;
  
  // Display requirements as bullet points
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
  const shop = new URLSearchParams(window.location.search).get('shop');
  const jobLink = shop ? HOST + '/submit?jobId=' + job.id + '&shop=' + encodeURIComponent(shop) : HOST + '/submit?jobId=' + job.id;
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
      const response = await makeAuthenticatedRequest('/api/admin/jobs' + queryParams);
      if (!response) return; // Redirecting to auth
      
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
  console.log('=== SUBMISSION LOADING DEBUG ===');
  console.log('Current URL:', window.location.href);
  console.log('Query params:', window.location.search);
  console.log('Shop param:', new URLSearchParams(window.location.search).get('shop'));
  const sessionValid = await checkSessionAndHandleAuth();
  if (!sessionValid) return;
  
  try {
    const queryParams = window.location.search;
    console.log('Making API request to:', '/api/admin/submissions' + queryParams);
    const response = await makeAuthenticatedRequest('/api/admin/submissions' + queryParams);
    console.log('API response:', response);
    
    if (!response) {
      console.log('No response received - likely redirecting to auth');
      return; // Redirecting to auth
    }
    
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);
    
    const data = await response.json();
    console.log('Response data:', data);

    allSubmissions = data.submissions || [];
    console.log('All submissions array:', allSubmissions);

    // Update stats
    document.getElementById('totalCount').textContent = allSubmissions.length;
    
    // Count pending submissions
    const pendingCount = allSubmissions.filter(s => 
      s.status === 'pending' || 
      (s.status === 'approved' && 
       s.reward_type === 'giftcard' && 
       s.reward_fulfilled !== true)
    ).length;
    
    const approvedCount = allSubmissions.filter(s => 
      s.status === 'approved' && 
      (s.reward_type !== 'giftcard' || s.reward_fulfilled === true)
    ).length;
    
    document.getElementById('pendingCount').textContent = pendingCount;
    document.getElementById('approvedCount').textContent = approvedCount;

    console.log('Stats updated - Total:', allSubmissions.length, 'Pending:', pendingCount, 'Approved:', approvedCount);

    // Display filtered submissions
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

// Display filtered submissions
function displaySubmissions() {
  let filteredSubmissions;
  
  if (currentSubmissionFilter === 'all') {
    filteredSubmissions = allSubmissions;
  } else if (currentSubmissionFilter === 'pending') {
    filteredSubmissions = allSubmissions.filter(s => 
      s.status === 'pending' || 
      (s.status === 'approved' && 
       s.reward_type === 'giftcard' && 
       s.reward_fulfilled !== true)
    );
  } else if (currentSubmissionFilter === 'approved') {
    filteredSubmissions = allSubmissions.filter(s => 
      s.status === 'approved' && 
      (s.reward_type !== 'giftcard' || s.reward_fulfilled === true)
    );
  } else {
    filteredSubmissions = allSubmissions.filter(s => s.status === currentSubmissionFilter);
  }

  const tableDiv = document.getElementById('submissionsTable');

  if (filteredSubmissions.length === 0) {
    tableDiv.innerHTML = `
      <div class="empty-state">
        <p>No ${currentSubmissionFilter === 'all' ? '' : currentSubmissionFilter} submissions.</p>
      </div>
    `;
    return;
  }

  tableDiv.innerHTML = `
    <table>
      <thead>
        <tr>
          <th class="col-id">ID</th>
          <th class="col-date">Date</th>
          <th class="col-customer">Customer</th>
          <th class="col-type">Type</th>
          <th class="col-job">Job</th>
          <th class="col-content">Content</th>
          <th class="col-media">Media</th>
          <th class="col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${filteredSubmissions.map(sub => `
          <tr>
            <td class="col-id" style="font-weight: 600; color: #666; font-size: 13px;">#${sub.id}</td>
            <td class="col-date">${new Date(sub.createdAt).toLocaleDateString()}</td>
            <td class="col-customer">${sub.customerEmail}</td>
            <td class="col-type">${sub.type}</td>
            <td class="col-job" style="max-width: 100px; word-wrap: break-word; word-break: break-word; white-space: normal; line-height: 1.2; font-size: 13px;">${sub.job_title ? `<a href="#" onclick="viewJobFromSubmission(event, ${sub.job_id})" style="color: #2c6ecb; text-decoration: none; cursor: pointer;">${sub.job_title}</a>` : '-'}</td>
            <td class="col-content review-content">${sub.content || 'No content'}</td>
            <td class="col-media">
              ${sub.mediaUrl ? (
                sub.type === 'video' 
                  ? `<video class="media-preview lazy" data-src="${sub.mediaUrl}" onclick="openModal('${sub.mediaUrl}', 'video')"></video>`
                  : `<img class="media-preview lazy" data-src="${sub.mediaUrl}" onclick="openModal('${sub.mediaUrl}', 'image')" alt="Submission media">`
              ) : '-'}
            </td>
            <td class="col-actions">
              ${sub.status === 'pending' ? `
                <button onclick="approveSubmission(${sub.id})" class="btn btn-primary btn-sm">Approve</button>
                <button onclick="rejectSubmission(${sub.id})" class="btn btn-danger btn-sm">Reject</button>
              ` : `
                <span class="status-${sub.status}">${sub.status}</span>
                ${sub.status === 'approved' && sub.reward_type === 'giftcard' ? `
                  <div style="margin-top: 8px;">
                    ${!sub.reward_fulfilled ? `
                      <button onclick="sendGiftCard(${sub.id})" class="btn btn-primary btn-sm">Send Gift Card Email</button>
                    ` : `
                      <button onclick="sendGiftCard(${sub.id})" class="btn btn-secondary btn-sm">Resend Gift Card Email</button>
                    `}
                  </div>
                ` : ''}
                ${sub.status === 'approved' && sub.reward_type !== 'giftcard' && sub.reward_type ? `
                  <div style="margin-top: 8px;">
                    <button onclick="resendRewardEmail(${sub.id})" class="btn btn-secondary btn-sm">Resend Reward Email</button>
                  </div>
                ` : ''}
                ${sub.status === 'rejected' ? `
                  <div style="margin-top: 8px;">
                    <button onclick="resendRejectionEmail(${sub.id})" class="btn btn-secondary btn-sm">Resend Rejection Email</button>
                  </div>
                ` : ''}
              `}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  // Observe lazy-loaded images and videos
  tableDiv.querySelectorAll('.lazy').forEach(element => {
    lazyImageObserver.observe(element);
  });
}

// Filter submissions
function filterSubmissions(filter) {
  currentSubmissionFilter = filter;
  
  // Update active button
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');
  
  displaySubmissions();
}

// Approve submission
async function approveSubmission(submissionId) {
  if (!confirm('Are you sure you want to approve this submission? This will trigger any associated rewards.')) {
    return;
  }
  
  try {
    const queryParams = window.location.search;
    const response = await makeAuthenticatedRequest('/api/admin/submissions/' + submissionId + '/approve' + queryParams, {
      method: 'POST'
    });
    
    if (!response) return; // Redirecting to auth
    
    if (response.ok) {
      alert('Submission approved successfully!');
      loadSubmissions();
    } else {
      const data = await response.json();
      if (data.keepPending) {
        alert(data.message || 'Failed to approve submission. The submission will remain pending for manual processing.');
      } else {
        alert(data.message || 'Failed to approve submission');
      }
      // Reload to show current status
      loadSubmissions();
    }
  } catch (error) {
    console.error('Error approving submission:', error);
    alert('Error approving submission. Please try again.');
  }
}

// Reject submission
async function rejectSubmission(submissionId) {
  if (!confirm('Are you sure you want to reject this submission?')) {
    return;
  }
  
  try {
    const queryParams = window.location.search;
    const response = await makeAuthenticatedRequest('/api/admin/submissions/' + submissionId + '/reject' + queryParams, {
      method: 'POST'
    });
    
    if (!response) return; // Redirecting to auth
    
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

// Send gift card
async function sendGiftCard(submissionId) {
  const code = prompt('Enter the gift card code:');
  const amount = prompt('Enter the gift card amount (numbers only):');
  
  if (!code || !amount) {
    alert('Gift card code and amount are required');
    return;
  }
  
  try {
    const queryParams = window.location.search;
    const response = await makeAuthenticatedRequest(`/api/admin/rewards/${submissionId}/send-giftcard${queryParams}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        giftCardCode: code,
        amount: parseFloat(amount)
      })
    });
    
    if (!response) return; // Redirecting to auth
    
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

// Resend rejection email
async function resendRejectionEmail(submissionId) {
  if (!confirm('Are you sure you want to resend the rejection email to this customer?')) {
    return;
  }
  
  try {
    const queryParams = window.location.search;
    const response = await makeAuthenticatedRequest(`/api/admin/submissions/${submissionId}/resend-rejection${queryParams}`, {
      method: 'POST'
    });
    
    if (!response) return; // Redirecting to auth
    
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
}

// Resend reward email
async function resendRewardEmail(submissionId) {
  if (!confirm('Are you sure you want to resend the reward email to this customer?')) {
    return;
  }
  
  try {
    const queryParams = window.location.search;
    const response = await makeAuthenticatedRequest(`/api/admin/submissions/${submissionId}/resend-reward${queryParams}`, {
      method: 'POST'
    });
    
    if (!response) return; // Redirecting to auth
    
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

// Close modals when clicking outside
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
}

// Add new requirement input
function addRequirement() {
  const requirementsList = document.getElementById('requirementsList');
  const newItem = document.createElement('li');
  newItem.className = 'requirement-item';
  newItem.innerHTML = `
    <input type="text" class="requirement-input" placeholder="Enter requirement">
    <button type="button" class="btn-remove" onclick="removeRequirement(this)">Remove</button>
  `;
  requirementsList.appendChild(newItem);
}

// Remove requirement input
function removeRequirement(button) {
  const requirementsList = document.getElementById('requirementsList');
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
  return requirements.join('\n');
}

// Set requirements from string
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

// Customizations Functions
async function loadCustomizations() {
  const sessionValid = await checkSessionAndHandleAuth();
  if (!sessionValid) return;
  
  try {
    const queryParams = window.location.search;
    // Add cache buster to prevent browser caching issues
    const cacheBuster = '&_t=' + Date.now();
    const response = await makeAuthenticatedRequest('/api/admin/customizations' + queryParams + cacheBuster);
    if (!response) return; // Redirecting to auth
    
    const customizations = await response.json();
    
    // Populate form with existing customizations
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
    if (customizations.hero_image_url) {
      document.getElementById('heroImageUrl').value = customizations.hero_image_url;
      showImagePreview('heroImagePreview', customizations.hero_image_url);
    }
    if (customizations.logo_url) {
      document.getElementById('logoUrl').value = customizations.logo_url;
      showImagePreview('logoPreview', customizations.logo_url);
    }
    if (customizations.show_example_videos !== undefined) {
      document.getElementById('showExampleVideos').checked = customizations.show_example_videos;
    }
    
    customizationsLoaded = true;
  } catch (error) {
    console.error('Error loading customizations:', error);
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

// Reset customizations to defaults
function resetCustomizationsToDefaults() {
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
  document.getElementById('showExampleVideos').checked = false;
  
  // Hide image previews
  document.getElementById('heroImagePreview').style.display = 'none';
  document.getElementById('logoPreview').style.display = 'none';
}

// Email Settings Functions
async function loadEmailSettings() {
  const sessionValid = await checkSessionAndHandleAuth();
  if (!sessionValid) return;
  
  try {
    const queryParams = window.location.search;
    // Add cache buster to prevent browser caching issues
    const cacheBuster = '&_t=' + Date.now();
    const response = await makeAuthenticatedRequest('/api/admin/customizations' + queryParams + cacheBuster);
    if (!response) return; // Redirecting to auth
    
    const customizations = await response.json();
    
    // Populate form with existing email settings
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
    if (customizations.notification_email) {
      document.getElementById('notificationEmail').value = customizations.notification_email;
    }
  } catch (error) {
    console.error('Error loading email settings:', error);
  }
}

// Quick Email Setup Functions
function openQuickEmailSetup() {
  document.getElementById('quickEmailSetupModal').classList.add('open');
}

function closeQuickEmailSetup() {
  document.getElementById('quickEmailSetupModal').classList.remove('open');
}

