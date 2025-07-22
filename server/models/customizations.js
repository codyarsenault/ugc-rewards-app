import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

export class CustomizationsModel {
  static async getByShop(shop) {
    try {
      const query = 'SELECT * FROM customizations WHERE shop_domain = $1';
      const result = await pool.query(query, [shop]);
      return result.rows[0] || {};
    } catch (error) {
      console.error('Error getting customizations:', error);
      return {};
    }
  }

  static async upsert(shop, customizations) {
    try {
      const query = `
        INSERT INTO customizations (
          shop_domain, 
          primary_color, 
          secondary_color, 
          text_color, 
          accent_color, 
          hero_image_url, 
          logo_url, 
          heading_font, 
          body_font, 
          show_example_videos, 
          example_video_1,
          example_video_2,
          example_video_3,
          example_video_4,
          custom_css,
          created_at,
          updated_at
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
        ON CONFLICT (shop_domain) 
        DO UPDATE SET 
          primary_color = EXCLUDED.primary_color,
          secondary_color = EXCLUDED.secondary_color,
          text_color = EXCLUDED.text_color,
          accent_color = EXCLUDED.accent_color,
          hero_image_url = EXCLUDED.hero_image_url,
          logo_url = EXCLUDED.logo_url,
          heading_font = EXCLUDED.heading_font,
          body_font = EXCLUDED.body_font,
          show_example_videos = EXCLUDED.show_example_videos,
          example_video_1 = EXCLUDED.example_video_1,
          example_video_2 = EXCLUDED.example_video_2,
          example_video_3 = EXCLUDED.example_video_3,
          example_video_4 = EXCLUDED.example_video_4,
          custom_css = EXCLUDED.custom_css,
          updated_at = NOW()
        RETURNING *
      `;
      
      const values = [
        shop,
        customizations.primaryColor || null,
        customizations.secondaryColor || null,
        customizations.textColor || null,
        customizations.accentColor || null,
        customizations.heroImageUrl || null,
        customizations.logoUrl || null,
        customizations.headingFont || null,
        customizations.bodyFont || null,
        customizations.showExampleVideos !== undefined ? customizations.showExampleVideos : true,
        customizations.exampleVideo1 || null,
        customizations.exampleVideo2 || null,
        customizations.exampleVideo3 || null,
        customizations.exampleVideo4 || null,
        customizations.customCss || null
      ];
      
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error upserting customizations:', error);
      throw error;
    }
  }
}