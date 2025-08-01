import pool from './db.js';

export class ShopInstallationsModel {
  static async create(shopData) {
    const { shop_domain, access_token, scope, email, country, currency, timezone, plan_name, plan_display_name, is_plus, is_partner_development_store, is_shopify_plus } = shopData;
    
    const query = `
      INSERT INTO shop_installations (
        shop_domain, 
        access_token, 
        scope, 
        email, 
        country, 
        currency, 
        timezone, 
        plan_name, 
        plan_display_name, 
        is_plus, 
        is_partner_development_store, 
        is_shopify_plus,
        installed_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      ON CONFLICT (shop_domain) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        scope = EXCLUDED.scope,
        email = EXCLUDED.email,
        country = EXCLUDED.country,
        currency = EXCLUDED.currency,
        timezone = EXCLUDED.timezone,
        plan_name = EXCLUDED.plan_name,
        plan_display_name = EXCLUDED.plan_display_name,
        is_plus = EXCLUDED.is_plus,
        is_partner_development_store = EXCLUDED.is_partner_development_store,
        is_shopify_plus = EXCLUDED.is_shopify_plus,
        updated_at = NOW()
    `;
    
    const values = [
      shop_domain,
      access_token,
      scope,
      email,
      country,
      currency,
      timezone,
      plan_name,
      plan_display_name,
      is_plus,
      is_partner_development_store,
      is_shopify_plus
    ];
    
    try {
      const result = await pool.query(query, values);
      console.log('Shop installation record created/updated for:', shop_domain);
      return result;
    } catch (error) {
      console.error('Error creating shop installation record:', error);
      throw error;
    }
  }
  
  static async getByShop(shopDomain) {
    const query = 'SELECT * FROM shop_installations WHERE shop_domain = $1';
    
    try {
      const result = await pool.query(query, [shopDomain]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting shop installation:', error);
      throw error;
    }
  }
  
  static async update(shopDomain, updateData) {
    const fields = Object.keys(updateData).map((key, index) => `${key} = $${index + 1}`).join(', ');
    const values = Object.values(updateData);
    values.push(shopDomain);
    
    const query = `
      UPDATE shop_installations 
      SET ${fields}, updated_at = NOW()
      WHERE shop_domain = $${values.length}
    `;
    
    try {
      const result = await pool.query(query, values);
      console.log('Shop installation updated for:', shopDomain);
      return result;
    } catch (error) {
      console.error('Error updating shop installation:', error);
      throw error;
    }
  }
  
  static async delete(shopDomain) {
    const query = 'DELETE FROM shop_installations WHERE shop_domain = $1';
    
    try {
      const result = await pool.query(query, [shopDomain]);
      console.log('Shop installation deleted for:', shopDomain);
      return result;
    } catch (error) {
      console.error('Error deleting shop installation:', error);
      throw error;
    }
  }
  
  static async getAll() {
    const query = 'SELECT * FROM shop_installations ORDER BY installed_at DESC';
    
    try {
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting all shop installations:', error);
      throw error;
    }
  }
  
  static async isInstalled(shopDomain) {
    const installation = await this.getByShop(shopDomain);
    return !!installation;
  }
} 