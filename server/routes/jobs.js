import express from 'express';
import { JobsModel } from '../models/jobs.js';

const router = express.Router();

// PUBLIC ROUTES (no auth required)
router.get('/public/jobs', async (req, res) => {
  try {
    const jobs = await JobsModel.getActiveJobs();
    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching active jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

router.get('/public/jobs/:id', async (req, res) => {
  try {
    const job = await JobsModel.getById(req.params.id);
    res.json({ job });
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// ADMIN ROUTES (auth required - handled in index.js)
router.get('/admin/jobs', async (req, res) => {
  try {
    const shopDomain = res.locals.shopify?.session?.shop || 'default-shop';
    const jobs = await JobsModel.getByShop(shopDomain);
    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

router.post('/admin/jobs', async (req, res) => {
  try {
    const shopDomain = res.locals.shopify?.session?.shop || 'default-shop';
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

// Update job (admin)
router.put('/admin/jobs/:id', async (req, res) => {
  try {
    const job = await JobsModel.update(req.params.id, req.body);
    res.json({ job });
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// Get active jobs for customers (public)
router.get('/public/jobs', async (req, res) => {
  try {
    const jobs = await JobsModel.getActiveJobs();
    res.json({ jobs });
  } catch (error) {
    console.error('Error fetching active jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// Get specific job details (public)
router.get('/public/jobs/:id', async (req, res) => {
  try {
    const job = await JobsModel.getById(req.params.id);
    res.json({ job });
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

export default router;