import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Create tables in order (respecting foreign key constraints)
    console.log('Creating shops table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS shops (
        id SERIAL PRIMARY KEY,
        shop_domain VARCHAR(255) NOT NULL UNIQUE,
        shop_name VARCHAR(255),
        email VARCHAR(255),
        plan VARCHAR(50) DEFAULT 'starter',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Creating campaigns table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        shop_id INTEGER REFERENCES shops(id),
        name VARCHAR(255) NOT NULL,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Creating customizations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS customizations (
        id SERIAL PRIMARY KEY,
        shop_domain VARCHAR(255) NOT NULL UNIQUE,
        primary_color VARCHAR(7) DEFAULT '#d4b896',
        secondary_color VARCHAR(7) DEFAULT '#f8f6f3',
        text_color VARCHAR(7) DEFAULT '#3a3a3a',
        accent_color VARCHAR(7) DEFAULT '#c9a961',
        hero_image_url TEXT,
        logo_url TEXT,
        heading_font VARCHAR(100) DEFAULT 'Montserrat',
        body_font VARCHAR(100) DEFAULT 'Inter',
        custom_css TEXT,
        show_example_videos BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        example_video_1 TEXT,
        example_video_2 TEXT,
        example_video_3 TEXT,
        example_video_4 TEXT,
        logo_size VARCHAR(20) DEFAULT 'medium',
        email_subject_confirmation VARCHAR(255) DEFAULT 'Thank you for your submission!',
        email_body_confirmation TEXT DEFAULT 'Thank you for sharing your experience! Your submission has been received and is pending review.',
        email_subject_approved VARCHAR(255) DEFAULT '🎉 Your submission has been approved!',
        email_body_approved TEXT DEFAULT 'Congratulations! Your submission has been approved. You will receive your reward code shortly.',
        email_subject_rejected VARCHAR(255) DEFAULT 'Update on your submission',
        email_body_rejected TEXT DEFAULT 'Thank you for your submission. Unfortunately, your submission was not approved at this time. We encourage you to try again!',
        email_subject_reward VARCHAR(255) DEFAULT '🎉 Your UGC Reward is Here!',
        email_body_reward TEXT DEFAULT 'Thank you for sharing your amazing content with us. As promised, here is your reward code:',
        email_subject_giftcard VARCHAR(255) DEFAULT '🎁 Your Gift Card is Here!',
        email_body_giftcard TEXT DEFAULT 'Thank you for your amazing UGC submission! Here is your gift card:',
        email_subject_free_product TEXT,
        email_body_free_product TEXT,
        email_subject_product TEXT,
        email_body_product TEXT,
        jobs_heading TEXT,
        jobs_subheading TEXT,
        submit_heading TEXT,
        submit_subheading TEXT,
        email_from_name TEXT,
        email_reply_to TEXT,
        notification_email TEXT
      );
    `);

    console.log('Creating jobs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT now(),
        shop_domain VARCHAR(255) NOT NULL DEFAULT '',
        requirements TEXT,
        type VARCHAR(50) NOT NULL DEFAULT 'photo' CHECK (type IN ('photo', 'video', 'review')),
        reward_type VARCHAR(50) NOT NULL DEFAULT 'percentage' CHECK (reward_type IN ('percentage', 'fixed', 'product', 'giftcard')),
        reward_value INTEGER NOT NULL DEFAULT 0,
        reward_product VARCHAR(255),
        spots_available INTEGER NOT NULL DEFAULT 1,
        spots_filled INTEGER NOT NULL DEFAULT 0,
        deadline TIMESTAMP,
        example_content TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reward_giftcard_amount INTEGER,
        reward_product_id TEXT,
        reward_product_handle TEXT,
        reward_product_image TEXT,
        reward_product_price NUMERIC(10,2),
        reward_fulfillment_type VARCHAR(20) DEFAULT 'automatic'
      );
    `);

    console.log('Creating submissions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER REFERENCES campaigns(id),
        customer_email VARCHAR(255) NOT NULL,
        customer_id VARCHAR(255),
        type VARCHAR(50) NOT NULL,
        content TEXT,
        media_url VARCHAR(500),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
        reward_sent BOOLEAN DEFAULT false,
        reward_sent_at TIMESTAMP,
        reward_fulfilled BOOLEAN DEFAULT false,
        reward_fulfilled_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Creating job_submissions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS job_submissions (
        id SERIAL PRIMARY KEY,
        job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(job_id, submission_id)
      );
    `);

    console.log('Creating rewards table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS rewards (
        id SERIAL PRIMARY KEY,
        submission_id INTEGER REFERENCES submissions(id),
        discount_code VARCHAR(50) UNIQUE,
        discount_percentage INTEGER,
        redeemed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
        type VARCHAR(50),
        code VARCHAR(100),
        value NUMERIC(10,2),
        status VARCHAR(50) DEFAULT 'pending',
        expires_at TIMESTAMP,
        shopify_price_rule_id VARCHAR(100),
        shopify_discount_code_id VARCHAR(100),
        sent_at TIMESTAMP,
        fulfilled_at TIMESTAMP,
        fulfilled_notes TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    console.log('Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_deadline ON jobs(deadline)',
      'CREATE INDEX IF NOT EXISTS idx_job_submissions_job ON job_submissions(job_id)',
      'CREATE INDEX IF NOT EXISTS idx_submissions_job ON submissions(job_id)',
      'CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status)',
      'CREATE INDEX IF NOT EXISTS idx_submissions_reward_fulfilled ON submissions(reward_fulfilled)'
    ];

    for (const index of indexes) {
      await client.query(index);
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run migration
migrate();