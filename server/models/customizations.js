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
          logo_size,
          heading_font, 
          body_font, 
          show_example_videos, 
          example_video_1,
          example_video_2,
          example_video_3,
          example_video_4,
          custom_css,
          email_subject_confirmation,
          email_body_confirmation,
          email_subject_rejected,
          email_body_rejected,
          email_subject_reward,
          email_body_reward,
          email_subject_giftcard,
          email_body_giftcard,
          email_subject_product,
          email_body_product,
          email_from_name,
          email_reply_to,
          jobs_heading,
          jobs_subheading,
          submit_heading,
          submit_subheading,
          created_at,
          updated_at
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, NOW(), NOW())
        ON CONFLICT (shop_domain) 
        DO UPDATE SET 
          primary_color = EXCLUDED.primary_color,
          secondary_color = EXCLUDED.secondary_color,
          text_color = EXCLUDED.text_color,
          accent_color = EXCLUDED.accent_color,
          hero_image_url = EXCLUDED.hero_image_url,
          logo_url = EXCLUDED.logo_url,
          logo_size = EXCLUDED.logo_size,
          heading_font = EXCLUDED.heading_font,
          body_font = EXCLUDED.body_font,
          show_example_videos = EXCLUDED.show_example_videos,
          example_video_1 = EXCLUDED.example_video_1,
          example_video_2 = EXCLUDED.example_video_2,
          example_video_3 = EXCLUDED.example_video_3,
          example_video_4 = EXCLUDED.example_video_4,
          custom_css = EXCLUDED.custom_css,
          email_subject_confirmation = EXCLUDED.email_subject_confirmation,
          email_body_confirmation = EXCLUDED.email_body_confirmation,
          email_subject_rejected = EXCLUDED.email_subject_rejected,
          email_body_rejected = EXCLUDED.email_body_rejected,
          email_subject_reward = EXCLUDED.email_subject_reward,
          email_body_reward = EXCLUDED.email_body_reward,
          email_subject_giftcard = EXCLUDED.email_subject_giftcard,
          email_body_giftcard = EXCLUDED.email_body_giftcard,
          email_subject_product = EXCLUDED.email_subject_product,
          email_body_product = EXCLUDED.email_body_product,
          email_from_name = EXCLUDED.email_from_name,
          email_reply_to = EXCLUDED.email_reply_to,
          jobs_heading = EXCLUDED.jobs_heading,
          jobs_subheading = EXCLUDED.jobs_subheading,
          submit_heading = EXCLUDED.submit_heading,
          submit_subheading = EXCLUDED.submit_subheading,
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
        customizations.logoSize || 'medium',
        customizations.headingFont || null,
        customizations.bodyFont || null,
        customizations.showExampleVideos !== undefined ? customizations.showExampleVideos : true,
        customizations.exampleVideo1 || null,
        customizations.exampleVideo2 || null,
        customizations.exampleVideo3 || null,
        customizations.exampleVideo4 || null,
        customizations.customCss || null,
        customizations.emailSubjectConfirmation || null,
        customizations.emailBodyConfirmation || null,
        customizations.emailSubjectRejected || null,
        customizations.emailBodyRejected || null,
        customizations.emailSubjectReward || null,
        customizations.emailBodyReward || null,
        customizations.emailSubjectGiftcard || null,
        customizations.emailBodyGiftcard || null,
        customizations.emailSubjectProduct || null,
        customizations.emailBodyProduct || null,
        customizations.emailFromName || null,
        customizations.emailReplyTo || null,
        customizations.jobsHeading || null,
        customizations.jobsSubheading || null,
        customizations.submitHeading || null,
        customizations.submitSubheading || null
      ];
      
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error upserting customizations:', error);
      throw error;
    }
  }
}