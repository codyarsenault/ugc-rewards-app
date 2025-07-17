import pool from './db.js';

export const SubmissionsModel = {
  // Get all submissions
  async getAll() {
    const query = `
      SELECT id, customer_email, type, content, media_url, status, created_at 
      FROM submissions 
      ORDER BY created_at DESC
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
      INSERT INTO submissions (customer_email, type, content, media_url, status, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `;
    const values = [
      submission.customerEmail, 
      submission.type, 
      submission.content, 
      submission.mediaUrl,
      submission.status || 'pending'
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }
};