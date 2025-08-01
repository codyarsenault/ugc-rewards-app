import express from 'express';
import { JobsModel } from '../models/jobs.js';

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

// ADMIN ROUTES (auth required via middleware in index.js)
adminJobRoutes.get('/jobs', async (req, res) => {
  try {
    // Get shop from query params (Shopify always includes this)
    const shop = req.query.shop;
    
    if (!shop) {
      return res.status(400).json({ error: 'Shop parameter required' });
    }
    
    console.log('Fetching jobs for shop:', shop);
    const jobs = await JobsModel.getByShop(shop);
    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

adminJobRoutes.post('/jobs', async (req, res) => {
  try {
    // Get shop from query params instead of session
    const shopDomain = req.query.shop;
    
    if (!shopDomain) {
      return res.status(400).json({ error: 'Shop parameter required' });
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

adminJobRoutes.put('/jobs/:id', async (req, res) => {
  try {
    const jobId = req.params.id;
    const shopDomain = req.query.shop;
    
    if (!shopDomain) {
      return res.status(400).json({ error: 'Shop parameter required' });
    }

    // Check if job exists and belongs to this shop
    const existingJob = await JobsModel.getById(jobId);
    if (!existingJob) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (existingJob.shop_domain !== shopDomain) {
      return res.status(403).json({ error: 'Unauthorized to update this job' });
    }

    // Update the job
    const job = await JobsModel.update(jobId, req.body);
    res.json({ job });
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

adminJobRoutes.delete('/jobs/:id', async (req, res) => {
  try {
    const jobId = req.params.id;
    const shopDomain = req.query.shop;
    
    if (!shopDomain) {
      return res.status(400).json({ error: 'Shop parameter required' });
    }

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

// Remove the default export
// export default router;