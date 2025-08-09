import express from 'express';
import { JobsModel } from '../models/jobs.js';
import { attachPlan, enforceLimit } from '../middleware/plan.js';

// Create separate routers for public and admin
export const publicJobRoutes = express.Router();
export const adminJobRoutes = express.Router();

// PUBLIC ROUTES (no auth required)
publicJobRoutes.get('/jobs', async (req, res) => {
  try {
    // Get shop from query params
    const shop = req.query.shop;
    
    if (!shop) {
      return res.status(400).json({ error: 'Shop parameter required' });
    }
    
    console.log('Fetching public jobs for shop:', shop);
    const jobs = await JobsModel.getActiveJobsByShop(shop);
    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching active jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

publicJobRoutes.get('/jobs/:id', async (req, res) => {
  try {
    // Get shop from query params
    const shop = req.query.shop;
    
    if (!shop) {
      return res.status(400).json({ error: 'Shop parameter required' });
    }
    
    const job = await JobsModel.getById(req.params.id);
    
    // Check if job exists and belongs to this shop
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.shop_domain !== shop) {
      return res.status(403).json({ error: 'Unauthorized to access this job' });
    }
    
    res.json({ job });
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// ADMIN ROUTES (auth required via validateSessionToken middleware in index.js)
// These routes now get the shop from res.locals.shopify.session

adminJobRoutes.get('/jobs', attachPlan, async (req, res) => {
  try {
    // Get shop from session (set by validateSessionToken middleware)
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    console.log('Fetching jobs for shop:', shop);
    const jobs = await JobsModel.getByShop(shop);
    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

adminJobRoutes.post('/jobs', attachPlan, async (req, res) => {
  try {
    // Get shop from session
    const session = res.locals.shopify.session;
    const shopDomain = session.shop;
    // Enforce plan limits: maxJobs
    const existing = await JobsModel.getByShop(shopDomain);
    const currentCount = existing?.length || 0;
    const max = req.planLimits?.maxJobs;
    if (typeof max === 'number' && currentCount >= max) {
      return res.status(402).json({ error: 'LIMIT_REACHED', message: `Your plan allows up to ${max} jobs.` });
    }
    // Disallow cash rewards unless plan supports it
    if (req.body?.rewardType === 'cash' && !(req.planFlags?.rewards?.cash)) {
      return res.status(402).json({ error: 'UPGRADE_REQUIRED', message: 'Cash rewards require the Pro plan.' });
    }
    
    const job = await JobsModel.create({
      shopDomain,
      ...req.body
    });
    res.json({ job });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

adminJobRoutes.put('/jobs/:id', attachPlan, async (req, res) => {
  try {
    const jobId = req.params.id;
    const session = res.locals.shopify.session;
    const shopDomain = session.shop;

    // Check if job exists and belongs to this shop
    const existingJob = await JobsModel.getById(jobId);
    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (existingJob.shop_domain !== shopDomain) {
      return res.status(403).json({ error: 'Unauthorized to update this job' });
    }

    // Disallow switching to cash rewards unless plan supports it
    if (req.body?.rewardType === 'cash' && !(req.planFlags?.rewards?.cash)) {
      return res.status(402).json({ error: 'UPGRADE_REQUIRED', message: 'Cash rewards require the Pro plan.' });
    }

    // Update the job
    const job = await JobsModel.update(jobId, req.body);
    res.json({ job });
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

adminJobRoutes.delete('/jobs/:id', attachPlan, async (req, res) => {
  try {
    const jobId = req.params.id;
    const session = res.locals.shopify.session;
    const shopDomain = session.shop;

    // Check if job exists
    const job = await JobsModel.getById(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Check if job belongs to this shop
    if (job.shop_domain !== shopDomain) {
      console.error('Shop mismatch:', job.shop_domain, shopDomain);
      return res.status(403).json({ error: 'Unauthorized to delete this job' });
    }

    // Delete the job
    await JobsModel.delete(jobId);

    res.json({ success: true, message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});