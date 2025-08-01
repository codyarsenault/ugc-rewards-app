-- Add shop_installations table to track app installations
CREATE TABLE IF NOT EXISTS shop_installations (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_shop_domain (shop_domain),
  INDEX idx_installed_at (installed_at)
); 