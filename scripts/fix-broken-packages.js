const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// List of packages that need fixing
const packagesToFix = [
  { name: '@shopify/shopify-api', path: '@shopify/shopify-api' },
  { name: '@shopify/shopify-app-express', path: '@shopify/shopify-app-express' },
  { name: '@shopify/shopify-app-session-storage', path: '@shopify/shopify-app-session-storage' },
  { name: '@shopify/shopify-app-session-storage-sqlite', path: '@shopify/shopify-app-session-storage-sqlite' },
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

console.log('Verification:');
console.log('jose lib exists:', fs.existsSync(path.join(nodeModulesPath, 'jose/dist/node/esm/lib')));
console.log('shopify-api dist exists:', fs.existsSync(path.join(nodeModulesPath, '@shopify/shopify-api/dist')));