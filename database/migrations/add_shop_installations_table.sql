-- Add shop_installations table to track app installations
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_shop_domain ON shop_installations (shop_domain);
CREATE INDEX IF NOT EXISTS idx_installed_at ON shop_installations (installed_at);

-- Create trigger to update updated_at automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_shop_installations_updated_at 
    BEFORE UPDATE ON shop_installations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column(); 