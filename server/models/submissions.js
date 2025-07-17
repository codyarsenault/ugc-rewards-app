import pool from './db.js';

export const SubmissionsModel = {
  // Get all submissions
  async getAll() {
    const query = `
      SELECT s.*, j.title as job_title
      FROM submissions s
      LEFT JOIN jobs j ON s.job_id = j.id
      ORDER BY s.created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  },

  // Get submission by ID
  async getById(id) {
    const query = 'SELECT * FROM submissions WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  },

  // Update submission status
  async updateStatus(id, status) {
    const query = 'UPDATE submissions SET status = $1 WHERE id = $2 RETURNING *';
    const result = await pool.query(query, [status, id]);
    return result.rows[0];
  },

  // Create new submission
  async create(submission) {
    const query = `
      INSERT INTO submissions (customer_email, type, content, media_url, status, job_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `;
    const values = [
      submission.customerEmail, 
      submission.type, 
      submission.content, 
      submission.mediaUrl,
      submission.status || 'pending',
      submission.jobId || null
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  // Create job submission link
  async linkToJob(submissionId, jobId) {
    const query = `
      INSERT INTO job_submissions (job_id, submission_id)
      VALUES ($1, $2)
      ON CONFLICT (job_id, submission_id) DO NOTHING
      RETURNING *
    `;
    const result = await pool.query(query, [jobId, submissionId]);
    return result.rows[0];
  }
};