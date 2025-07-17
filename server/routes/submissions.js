import express from 'express';
const router = express.Router();

// Simple test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Submissions route working!' });
});

export default router;
