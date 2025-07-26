const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// List of packages that need fixing
const packagesToFix = [
  { name: '@shopify/shopify-api', path: '@shopify/shopify-api' },
  { name: '@shopify/shopify-app-express', path: '@shopify/shopify-app-express' },
  { name: '@shopify/shopify-app-session-storage', path: '@shopify/shopify-app-session-storage' },
  { name: '@shopify/shopify-app-session-storage-sqlite', path: '@shopify/shopify-app-session-storage-sqlite' },
  { name: '@shopify/shopify-app-session-storage-memory', path: '@shopify/shopify-app-session-storage-memory' },
  { name: 'jose', path: 'jose' }
];

console.log('Fixing broken packages...\n');

const nodeModulesPath = path.join(__dirname, '..', 'node_modules');

packagesToFix.forEach(({ name, path: pkgPath }) => {
  const fullPath = path.join(nodeModulesPath, pkgPath);
  
  console.log(`Checking ${name}...`);
  
  try {
    // Remove existing broken package
    if (fs.existsSync(fullPath)) {
      execSync(`rm -rf "${fullPath}"`, { stdio: 'inherit' });
    }
    
    // Download and extract fresh copy
    const dir = path.dirname(fullPath);
    const basename = path.basename(fullPath);
    
    execSync(`cd "${dir}" && npm pack ${name} && tar -xzf *.tgz && mv package "${basename}" && rm *.tgz`, { 
      stdio: 'inherit',
      shell: true 
    });
    
    console.log(`✓ Fixed ${name}\n`);
  } catch (error) {
    console.error(`✗ Failed to fix ${name}: ${error.message}\n`);
  }
});

// Check for any other potentially broken @shopify packages
console.log('\nChecking for other @shopify packages...');
const shopifyDir = path.join(nodeModulesPath, '@shopify');
if (fs.existsSync(shopifyDir)) {
  const shopifyPackages = fs.readdirSync(shopifyDir);
  shopifyPackages.forEach(pkg => {
    const pkgPath = path.join(shopifyDir, pkg);
    const stats = fs.statSync(pkgPath);
    if (stats.isDirectory()) {
      const contents = fs.readdirSync(pkgPath);
      console.log(`@shopify/${pkg}: ${contents.length} files/folders`);
      
      // If package only has 2-3 files (package.json, README, maybe node_modules), it's likely broken
      if (contents.length <= 3 && !contents.includes('dist') && !contents.includes('lib') && !contents.includes('src')) {
        console.log(`  ⚠️  Package appears incomplete`);
      }
    }
  });
}

console.log('\nVerification complete.');