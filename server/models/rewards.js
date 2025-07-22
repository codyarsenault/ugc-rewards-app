import pool from './db.js';

export const RewardsModel = {
  async create(rewardData) {
    const query = `
      INSERT INTO rewards (
        submission_id, job_id, type, code, value, 
        status, expires_at, shopify_price_rule_id, shopify_discount_code_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const values = [
      rewardData.submissionId,
      rewardData.jobId,
      rewardData.type,
      rewardData.code,
      rewardData.value,
      rewardData.status || 'pending',
      rewardData.expiresAt,
      rewardData.shopifyPriceRuleId,
      rewardData.shopifyDiscountCodeId
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async markAsSent(id) {
    const query = `
      UPDATE rewards 
      SET status = 'sent', sent_at = NOW() 
      WHERE id = $1 
      RETURNING *
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  },

  async getBySubmissionId(submissionId) {
    const query = 'SELECT * FROM rewards WHERE submission_id = $1';
    const result = await pool.query(query, [submissionId]);
    return result.rows[0];
  },

  async updateSubmissionRewardStatus(submissionId) {
    const query = `
      UPDATE submissions 
      SET reward_sent = true, reward_sent_at = NOW() 
      WHERE id = $1 
      RETURNING *
    `;
    const result = await pool.query(query, [submissionId]);
    return result.rows[0];
  },

  async update(id, updateData) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Build dynamic query based on provided fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(updateData[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);
    const query = `
      UPDATE rewards 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }
};