import db from './db.js';

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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        access_token = VALUES(access_token),
        scope = VALUES(scope),
        email = VALUES(email),
        country = VALUES(country),
        currency = VALUES(currency),
        timezone = VALUES(timezone),
        plan_name = VALUES(plan_name),
        plan_display_name = VALUES(plan_display_name),
        is_plus = VALUES(is_plus),
        is_partner_development_store = VALUES(is_partner_development_store),
        is_shopify_plus = VALUES(is_shopify_plus),
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
      const result = await db.execute(query, values);
      console.log('Shop installation record created/updated for:', shop_domain);
      return result;
    } catch (error) {
      console.error('Error creating shop installation record:', error);
      throw error;
    }
  }
  
  static async getByShop(shopDomain) {
    const query = 'SELECT * FROM shop_installations WHERE shop_domain = ?';
    
    try {
      const [rows] = await db.execute(query, [shopDomain]);
      return rows[0] || null;
    } catch (error) {
      console.error('Error getting shop installation:', error);
      throw error;
    }
  }
  
  static async update(shopDomain, updateData) {
    const fields = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updateData);
    values.push(shopDomain);
    
    const query = `
      UPDATE shop_installations 
      SET ${fields}, updated_at = NOW()
      WHERE shop_domain = ?
    `;
    
    try {
      const result = await db.execute(query, values);
      console.log('Shop installation updated for:', shopDomain);
      return result;
    } catch (error) {
      console.error('Error updating shop installation:', error);
      throw error;
    }
  }
  
  static async delete(shopDomain) {
    const query = 'DELETE FROM shop_installations WHERE shop_domain = ?';
    
    try {
      const result = await db.execute(query, [shopDomain]);
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
      const [rows] = await db.execute(query);
      return rows;
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