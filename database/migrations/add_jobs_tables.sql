-- Jobs table: stores job postings created by brands
CREATE TABLE jobs (
    id SERIAL PRIMARY KEY,
    shop_domain VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    requirements TEXT, -- Specific requirements for the content
    type VARCHAR(50) NOT NULL CHECK (type IN ('photo', 'video', 'review')),
    reward_type VARCHAR(50) NOT NULL DEFAULT 'percentage' CHECK (reward_type IN ('percentage', 'fixed', 'product')),
    reward_value INTEGER NOT NULL, -- Percentage off or fixed amount
    reward_product VARCHAR(255), -- Product name if reward_type is 'product'
    spots_available INTEGER NOT NULL DEFAULT 1,
    spots_filled INTEGER NOT NULL DEFAULT 0,
    deadline TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'expired')),
    example_content TEXT, -- URLs or description of example content
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Job submissions: links submissions to specific jobs
CREATE TABLE job_submissions (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    submission_id INTEGER REFERENCES submissions(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, submission_id)
);

-- Update submissions table to optionally link to a job
ALTER TABLE submissions ADD COLUMN job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX idx_jobs_shop ON jobs(shop_domain);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_deadline ON jobs(deadline);
CREATE INDEX idx_job_submissions_job ON job_submissions(job_id);
CREATE INDEX idx_submissions_job ON submissions(job_id);