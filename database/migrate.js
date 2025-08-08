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

    // Add notification_email column to existing customizations table if it doesn't exist
    console.log('Ensuring all customizations columns exist...');
    const customizationColumns = [
      { name: 'notification_email', type: 'TEXT' },
      { name: 'email_from_name', type: 'TEXT' },
      { name: 'email_reply_to', type: 'TEXT' },
      { name: 'email_subject_product', type: 'TEXT' },
      { name: 'email_body_product', type: 'TEXT' }
    ];

    for (const column of customizationColumns) {
      await client.query(`
        ALTER TABLE customizations ADD COLUMN IF NOT EXISTS ${column.name} ${column.type};
      `);
    }

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

    // Extend jobs table to support 'cash' reward type and amount
    console.log("Extending jobs table for 'cash' reward type...");
        await client.query(`
       DO $$
       DECLARE r record;
       BEGIN
         -- Drop only CHECK constraints that enforce specific allowed values on reward_type (not NOT NULL)
         FOR r IN
           SELECT tc.constraint_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
           WHERE tc.table_name = 'jobs'
             AND tc.constraint_type = 'CHECK'
             AND cc.check_clause ILIKE '%reward_type%'
             AND cc.check_clause ILIKE '% IN %'
         LOOP
           EXECUTE format('ALTER TABLE jobs DROP CONSTRAINT IF EXISTS %I', r.constraint_name);
         END LOOP;
       END$$;
     `);
        await client.query(`
       DO $$
       DECLARE conname text; clause text;
       BEGIN
         -- Try to get named constraint first
         SELECT tc.constraint_name, cc.check_clause INTO conname, clause
         FROM information_schema.table_constraints tc
         JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
         WHERE tc.table_name='jobs' AND tc.constraint_type='CHECK' AND tc.constraint_name='jobs_reward_type_check';

         -- If not found, find any reward_type check constraint
         IF conname IS NULL THEN
           SELECT tc.constraint_name, cc.check_clause INTO conname, clause
           FROM information_schema.table_constraints tc
           JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
           WHERE tc.table_name='jobs' AND tc.constraint_type='CHECK' AND cc.check_clause ILIKE '%reward_type%'
           LIMIT 1;
         END IF;

         IF conname IS NULL THEN
           -- No existing constraint, add fresh
           EXECUTE 'ALTER TABLE jobs ADD CONSTRAINT jobs_reward_type_check CHECK (reward_type IN (''percentage'',''fixed'',''product'',''giftcard'',''cash''))';
         ELSE
           -- If it already includes cash, do nothing; else replace
           IF clause ILIKE '%cash%' THEN
             -- already supports cash
             PERFORM 1;
           ELSE
             EXECUTE format('ALTER TABLE jobs DROP CONSTRAINT %I', conname);
             EXECUTE 'ALTER TABLE jobs ADD CONSTRAINT jobs_reward_type_check CHECK (reward_type IN (''percentage'',''fixed'',''product'',''giftcard'',''cash''))';
           END IF;
         END IF;
       END$$;
     `);
    await client.query(`
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reward_cash_amount NUMERIC(10,2);
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
        shop_domain VARCHAR(255),
        reward_sent BOOLEAN DEFAULT false,
        reward_sent_at TIMESTAMP,
        reward_fulfilled BOOLEAN DEFAULT false,
        reward_fulfilled_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add shop_domain column to submissions if it doesn't exist
    console.log('Adding shop_domain column to submissions table if needed...');
    await client.query(`
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS shop_domain VARCHAR(255);
    `);

    // Add PayPal email to submissions
    console.log('Adding paypal_email column to submissions table if needed...');
    await client.query(`
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS paypal_email TEXT;
    `);

    // Add shop_submission_number column to submissions if it doesn't exist
    console.log('Adding shop_submission_number column to submissions table if needed...');
    await client.query(`
      ALTER TABLE submissions ADD COLUMN IF NOT EXISTS shop_submission_number INTEGER;
    `);

    // Populate shop_submission_number for existing submissions
    console.log('Populating shop_submission_number for existing submissions...');
    await client.query(`
      WITH numbered_submissions AS (
        SELECT 
          id,
          shop_domain,
          ROW_NUMBER() OVER (PARTITION BY shop_domain ORDER BY created_at ASC, id ASC) as submission_number
        FROM submissions 
        WHERE shop_domain IS NOT NULL
      )
      UPDATE submissions 
      SET shop_submission_number = numbered_submissions.submission_number
      FROM numbered_submissions 
      WHERE submissions.id = numbered_submissions.id
        AND submissions.shop_submission_number IS NULL;
    `);

    // Update existing submissions with shop domain from their jobs
    console.log('Migrating shop domains for existing submissions...');
    await client.query(`
      UPDATE submissions 
      SET shop_domain = jobs.shop_domain
      FROM jobs 
      WHERE submissions.job_id = jobs.id 
        AND submissions.shop_domain IS NULL 
        AND submissions.job_id IS NOT NULL;
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

    // Add PayPal specific tracking columns to rewards
    console.log('Adding PayPal tracking columns to rewards table if needed...');
    await client.query(`
      ALTER TABLE rewards ADD COLUMN IF NOT EXISTS paypal_email TEXT;
    `);
    await client.query(`
      ALTER TABLE rewards ADD COLUMN IF NOT EXISTS paypal_transaction_id TEXT;
    `);

    console.log('Creating sessions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        shop VARCHAR(255) NOT NULL,
        state VARCHAR(255) NOT NULL,
        is_online BOOLEAN NOT NULL DEFAULT false,
        scope VARCHAR(255),
        expires TIMESTAMP,
        access_token VARCHAR(255),
        user_id BIGINT,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        email VARCHAR(255),
        account_owner BOOLEAN,
        locale VARCHAR(10),
        collaborator BOOLEAN,
        email_verified BOOLEAN
      );
    `);

    console.log('Creating shop_installations table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS shop_installations (
        id SERIAL PRIMARY KEY,
        shop_domain VARCHAR(255) NOT NULL UNIQUE,
        access_token TEXT NOT NULL,
        scope TEXT,
        email VARCHAR(255),
        country VARCHAR(10),
        currency VARCHAR(10),
        timezone VARCHAR(50),
        plan_name VARCHAR(100),
        plan_display_name VARCHAR(100),
        is_plus BOOLEAN DEFAULT FALSE,
        is_partner_development_store BOOLEAN DEFAULT FALSE,
        is_shopify_plus BOOLEAN DEFAULT FALSE,
        installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    console.log('Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_shop_domain ON jobs(shop_domain)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_deadline ON jobs(deadline)',
      'CREATE INDEX IF NOT EXISTS idx_job_submissions_job ON job_submissions(job_id)',
      'CREATE INDEX IF NOT EXISTS idx_submissions_job ON submissions(job_id)',
      'CREATE INDEX IF NOT EXISTS idx_submissions_shop_domain ON submissions(shop_domain)',
      'CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status)',
      'CREATE INDEX IF NOT EXISTS idx_submissions_reward_fulfilled ON submissions(reward_fulfilled)',
      'CREATE INDEX IF NOT EXISTS idx_customizations_shop_domain ON customizations(shop_domain)',
      'CREATE INDEX IF NOT EXISTS idx_rewards_submission ON rewards(submission_id)',
      'CREATE INDEX IF NOT EXISTS idx_shop_installations_domain ON shop_installations(shop_domain)',
      'CREATE INDEX IF NOT EXISTS idx_shop_installations_installed_at ON shop_installations(installed_at)'
    ];

    for (const index of indexes) {
      await client.query(index);
      console.log(`Created/verified index: ${index.match(/idx_\w+/)[0]}`);
    }

    // Verify critical columns exist
    console.log('Verifying critical columns...');
    const criticalChecks = [
      { table: 'submissions', column: 'shop_domain' },
      { table: 'jobs', column: 'shop_domain' },
      { table: 'customizations', column: 'notification_email' },
      { table: 'customizations', column: 'email_from_name' }
    ];

    // Verify shop_installations table exists
    console.log('Verifying shop_installations table...');
    const installationsResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'shop_installations'
    `);
    
    if (installationsResult.rows.length > 0) {
      console.log('✅ shop_installations table exists');
    } else {
      console.log('❌ shop_installations table is missing!');
    }

    // Verify sessions table exists
    console.log('Verifying sessions table...');
    const sessionsResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'sessions'
    `);
    
    if (sessionsResult.rows.length > 0) {
      console.log('✅ sessions table exists');
    } else {
      console.log('❌ sessions table is missing!');
    }

    for (const check of criticalChecks) {
      const result = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = $1 AND column_name = $2
      `, [check.table, check.column]);
      
      if (result.rows.length > 0) {
        console.log(`✅ ${check.table}.${check.column} exists`);
      } else {
        console.log(`❌ ${check.table}.${check.column} is missing!`);
      }
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