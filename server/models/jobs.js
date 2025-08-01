import pool from './db.js';

export const JobsModel = {
  // Create a new job
  async create(job) {
    const query = `
      INSERT INTO jobs (
        shop_domain, title, description, requirements, type, 
        reward_type, reward_value, reward_product, reward_giftcard_amount, spots_available, 
        deadline, example_content, reward_product_id, reward_product_handle, 
        reward_product_image, reward_product_price
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;
    const values = [
      job.shopDomain,
      job.title,
      job.description,
      job.requirements,
      job.type,
      job.rewardType || 'percentage',
      job.rewardValue || null,  // Convert empty string to null
      job.rewardProduct || null,
      job.rewardGiftCardAmount || null,  // Convert empty string to null
      job.spotsAvailable || 1,
      job.deadline || null,
      job.exampleContent || null,
      job.rewardProductId || null,
      job.rewardProductHandle || null,
      job.rewardProductImage || null,
      job.rewardProductPrice || null
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  // Get all jobs for a shop
  async getByShop(shopDomain) {
    const query = `
      SELECT j.*, 
        (SELECT COUNT(*) FROM job_submissions js WHERE js.job_id = j.id AND js.status = 'approved') as approved_count
      FROM jobs j
      WHERE j.shop_domain = $1
      ORDER BY j.created_at DESC
    `;
    const result = await pool.query(query, [shopDomain]);
    return result.rows;
  },

  // Get active jobs for customers
  async getActiveJobs() {
    const query = `
      SELECT j.*, 
        (SELECT COUNT(*) FROM job_submissions js WHERE js.job_id = j.id) as submission_count
      FROM jobs j
      WHERE j.status = 'active' 
        AND j.spots_filled < j.spots_available
        AND (j.deadline IS NULL OR j.deadline > NOW())
      ORDER BY j.created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
  },

  // Get active jobs for customers filtered by shop
  async getActiveJobsByShop(shopDomain) {
    const query = `
      SELECT j.*, 
        (SELECT COUNT(*) FROM job_submissions js WHERE js.job_id = j.id) as submission_count
      FROM jobs j
      WHERE j.shop_domain = $1
        AND j.status = 'active' 
        AND j.spots_filled < j.spots_available
        AND (j.deadline IS NULL OR j.deadline > NOW())
      ORDER BY j.created_at DESC
    `;
    const result = await pool.query(query, [shopDomain]);
    return result.rows;
  },

  // Get job by ID
  async getById(id) {
    const query = 'SELECT * FROM jobs WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  },

  // Update job
  async update(id, updates) {
    // Map camelCase keys to snake_case for DB columns
    const mapping = {
      shopDomain: 'shop_domain',
      rewardType: 'reward_type',
      rewardValue: 'reward_value',
      rewardProduct: 'reward_product',
      spotsAvailable: 'spots_available',
      spotsFilled: 'spots_filled',
      exampleContent: 'example_content',
      createdAt: 'created_at',
      rewardGiftCardAmount: 'reward_giftcard_amount',
      rewardProductId: 'reward_product_id',           // Add this
      rewardProductHandle: 'reward_product_handle',   // Add this
      rewardProductImage: 'reward_product_image',     // Add this
      rewardProductPrice: 'reward_product_price',     // Add this
      updatedAt: 'updated_at'
      // Add more mappings as needed
    };
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      const dbKey = mapping[key] || key;
      fields.push(`${dbKey} = $${paramCount}`);
      
      // Convert empty strings to null for numeric fields
      let processedValue = value;
      if (value === '' && ['reward_value', 'spots_available', 'spots_filled', 'reward_giftcard_amount', 'reward_product_price'].includes(dbKey)) {
        processedValue = null;
      }
      
      values.push(processedValue);
      paramCount++;
    });

    values.push(id);
    const query = `
      UPDATE jobs 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  // Update job status
  async updateStatus(id, status) {
    return this.update(id, { status });
  },

  // Increment spots filled
  async incrementSpotsFilled(id) {
    const query = `
      UPDATE jobs 
      SET spots_filled = spots_filled + 1 
      WHERE id = $1 AND spots_filled < spots_available
      RETURNING *
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  },

  // Add this method to your JobsModel
async decrementSpotsFilled(id) {
  const query = `
    UPDATE jobs 
    SET spots_filled = GREATEST(spots_filled - 1, 0) 
    WHERE id = $1
    RETURNING *
  `;
  const result = await pool.query(query, [id]);
  return result.rows[0];
},

// Add this method to your JobsModel
async delete(id) {
  // This will cascade delete related job_submissions due to ON DELETE CASCADE
  const query = 'DELETE FROM jobs WHERE id = $1 RETURNING *';
  const result = await pool.query(query, [id]);
  return result.rows[0];
},

  // Get submissions for a job
  async getJobSubmissions(jobId) {
    const query = `
      SELECT s.*, js.status as job_submission_status
      FROM submissions s
      JOIN job_submissions js ON s.id = js.submission_id
      WHERE js.job_id = $1
      ORDER BY s.created_at DESC
    `;
    const result = await pool.query(query, [jobId]);
    return result.rows;
  },

  // GDPR compliance method
  async redactShopData(shopDomain) {
    const query = `
      DELETE FROM jobs 
      WHERE shop_domain = $1
    `;
    
    await pool.query(query, [shopDomain]);
  }
};