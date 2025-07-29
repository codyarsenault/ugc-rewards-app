import pool from './db.js';

export const SubmissionsModel = {
  // Get all submissions
  async getAll() {
    const query = `
      SELECT s.*, j.title as job_title, j.reward_type, j.shop_domain as job_shop_domain,
             CASE WHEN r.status = 'fulfilled' THEN true ELSE false END as reward_fulfilled
      FROM submissions s
      LEFT JOIN jobs j ON s.job_id = j.id
      LEFT JOIN rewards r ON s.id = r.submission_id
      ORDER BY s.created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  },

  // Get submissions for a specific shop
  async getByShop(shopDomain) {
    const query = `
      SELECT s.*, j.title as job_title, j.reward_type, 
             CASE WHEN r.status = 'fulfilled' THEN true ELSE false END as reward_fulfilled
      FROM submissions s
      LEFT JOIN jobs j ON s.job_id = j.id
      LEFT JOIN rewards r ON s.id = r.submission_id
      WHERE j.shop_domain = $1 OR s.shop_domain = $1
      ORDER BY s.created_at DESC
    `;
    const result = await pool.query(query, [shopDomain]);
    return result.rows;
  },

  // Get submission by ID with full details
  async getById(id) {
    const query = `
      SELECT s.*, 
             j.title as job_title, 
             j.reward_type, 
             j.reward_value, 
             j.reward_product, 
             j.reward_giftcard_amount, 
             j.shop_domain as job_shop_domain
      FROM submissions s
      LEFT JOIN jobs j ON s.job_id = j.id
      WHERE s.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  },

  // Update submission status
  async updateStatus(id, status) {
    const query = 'UPDATE submissions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
    const result = await pool.query(query, [status, id]);
    return result.rows[0];
  },

  // Create new submission with shop domain
  async create(submission) {
    const query = `
      INSERT INTO submissions (
        customer_email, 
        type, 
        content, 
        media_url, 
        status, 
        job_id, 
        shop_domain,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `;
    const values = [
      submission.customerEmail, 
      submission.type, 
      submission.content, 
      submission.mediaUrl,
      submission.status || 'pending',
      submission.jobId || null,
      submission.shopDomain || null
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
  },

  // Update submission with any fields
  async update(id, updateData) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Build dynamic query based on provided fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        // Convert camelCase to snake_case for database fields
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        fields.push(`${dbKey} = $${paramCount}`);
        values.push(updateData[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);
    const query = `
      UPDATE submissions 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  // Get submissions by job ID
  async getByJobId(jobId) {
    const query = `
      SELECT s.*, 
             CASE WHEN r.status = 'fulfilled' THEN true ELSE false END as reward_fulfilled
      FROM submissions s
      LEFT JOIN rewards r ON s.id = r.submission_id
      WHERE s.job_id = $1
      ORDER BY s.created_at DESC
    `;
    const result = await pool.query(query, [jobId]);
    return result.rows;
  },

  // Count submissions by status for a shop
  async countByStatus(shopDomain) {
    const query = `
      SELECT 
        s.status,
        COUNT(*) as count
      FROM submissions s
      LEFT JOIN jobs j ON s.job_id = j.id
      WHERE j.shop_domain = $1 OR s.shop_domain = $1
      GROUP BY s.status
    `;
    const result = await pool.query(query, [shopDomain]);
    
    // Convert to object for easier access
    const counts = {
      pending: 0,
      approved: 0,
      rejected: 0
    };
    
    result.rows.forEach(row => {
      counts[row.status] = parseInt(row.count);
    });
    
    return counts;
  },

  // Get recent submissions for a shop (with limit)
  async getRecentByShop(shopDomain, limit = 10) {
    const query = `
      SELECT s.*, j.title as job_title, j.reward_type,
             CASE WHEN r.status = 'fulfilled' THEN true ELSE false END as reward_fulfilled
      FROM submissions s
      LEFT JOIN jobs j ON s.job_id = j.id
      LEFT JOIN rewards r ON s.id = r.submission_id
      WHERE j.shop_domain = $1 OR s.shop_domain = $1
      ORDER BY s.created_at DESC
      LIMIT $2
    `;
    const result = await pool.query(query, [shopDomain, limit]);
    return result.rows;
  },

  // Check if email has already submitted for a specific job
  async checkDuplicateSubmission(email, jobId) {
    const query = `
      SELECT id FROM submissions 
      WHERE customer_email = $1 AND job_id = $2
      LIMIT 1
    `;
    const result = await pool.query(query, [email, jobId]);
    return result.rows.length > 0;
  }
};