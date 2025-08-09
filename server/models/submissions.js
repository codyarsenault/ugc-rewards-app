import pool from './db.js';

export const SubmissionsModel = {
  // Get all submissions
  async getAll() {
    const query = `
      SELECT s.*, j.title as job_title, j.reward_type, j.shop_domain as job_shop_domain,
             CASE WHEN r.status = 'fulfilled' THEN true ELSE false END as reward_fulfilled,
             r.paypal_transaction_id as reward_paypal_transaction_id
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
             CASE WHEN r.status = 'fulfilled' THEN true ELSE false END as reward_fulfilled,
             r.paypal_transaction_id as reward_paypal_transaction_id
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
             j.shop_domain as job_shop_domain,
             r.paypal_transaction_id as reward_paypal_transaction_id,
             CASE WHEN r.status = 'fulfilled' THEN true ELSE false END as reward_fulfilled
      FROM submissions s
      LEFT JOIN jobs j ON s.job_id = j.id
      LEFT JOIN rewards r ON s.id = r.submission_id
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
    // Get the next submission number for this shop
    const shopSubmissionNumber = await this.getNextShopSubmissionNumber(submission.shopDomain);
    
    const query = `
      INSERT INTO submissions (
        customer_email, 
        type, 
        content, 
        media_url, 
        status, 
        job_id, 
        shop_domain,
        shop_submission_number,
        paypal_email,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `;
    const values = [
      submission.customerEmail, 
      submission.type, 
      submission.content, 
      submission.mediaUrl,
      submission.status || 'pending',
      submission.jobId || null,
      submission.shopDomain || null,
      shopSubmissionNumber,
      submission.paypalEmail || null
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  // Get the next submission number for a specific shop
  async getNextShopSubmissionNumber(shopDomain) {
    if (!shopDomain) {
      return 1; // Default to 1 if no shop domain
    }
    
    const query = `
      SELECT COALESCE(MAX(shop_submission_number), 0) + 1 as next_number
      FROM submissions 
      WHERE shop_domain = $1
    `;
    const result = await pool.query(query, [shopDomain]);
    return result.rows[0].next_number;
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
             CASE WHEN r.status = 'fulfilled' THEN true ELSE false END as reward_fulfilled,
             r.paypal_transaction_id as reward_paypal_transaction_id
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

  // Count approved submissions in the current month for a shop
  async countApprovedThisMonthByShop(shopDomain) {
    const query = `
      SELECT COUNT(*)::int as count
      FROM submissions s
      LEFT JOIN jobs j ON s.job_id = j.id
      WHERE (j.shop_domain = $1 OR s.shop_domain = $1)
        AND s.status = 'approved'
        AND s.updated_at >= date_trunc('month', now())
        AND s.updated_at < (date_trunc('month', now()) + interval '1 month')
    `;
    const result = await pool.query(query, [shopDomain]);
    return result.rows[0]?.count || 0;
  },

  // Get recent submissions for a shop (with limit)
  async getRecentByShop(shopDomain, limit = 10) {
    const query = `
      SELECT s.*, j.title as job_title, j.reward_type,
             CASE WHEN r.status = 'fulfilled' THEN true ELSE false END as reward_fulfilled,
             r.paypal_transaction_id as reward_paypal_transaction_id
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
  },

  // GDPR compliance methods
  async redactCustomerData(shopDomain, customerEmail) {
    const query = `
      UPDATE submissions 
      SET customer_email = 'REDACTED', content = 'REDACTED', media_url = NULL 
      WHERE shop_domain = $1 AND customer_email = $2
    `;
    
    await pool.query(query, [shopDomain, customerEmail]);
  },

  async getCustomerData(shopDomain, customerEmail) {
    const query = `
      SELECT * FROM submissions 
      WHERE shop_domain = $1 AND customer_email = $2
    `;
    
    const result = await pool.query(query, [shopDomain, customerEmail]);
    return result.rows;
  },

  async redactShopData(shopDomain) {
    // When a shop is deleted, we should remove all their submissions
    // But first redact any personally identifiable information
    const query = `
      DELETE FROM submissions 
      WHERE shop_domain = $1 OR job_id IN (SELECT id FROM jobs WHERE shop_domain = $1)
    `;
    
    await pool.query(query, [shopDomain]);
  }
};