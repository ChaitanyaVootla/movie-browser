const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

/**
 * Creates a Lambda deployment package by zipping the necessary files.
 * This script is platform-independent and handles all packaging in Node.js.
 */
async function packageLambda() {
    const outputPath = 'lambda-deployment.zip';
    
    // Remove existing zip file if it exists
    if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
        console.log('🗑️  Removed existing deployment package');
    }

    // Create a file to stream archive data to
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
    });

    // Listen for all archive data to be written
    output.on('close', () => {
        const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
        console.log(`✅ Lambda deployment package created: ${outputPath}`);
        console.log(`📦 Package size: ${sizeInMB} MB`);
        console.log('🚀 Ready for Terraform deployment!');
    });

    // Handle errors
    archive.on('error', (err) => {
        console.error('❌ Error creating deployment package:', err);
        process.exit(1);
    });

    // Pipe archive data to the file
    archive.pipe(output);

    console.log('📦 Creating Lambda deployment package...');

    // Check if dist folder exists
    if (!fs.existsSync('dist')) {
        console.error('❌ dist/ folder not found. Run "npm run build" first.');
        process.exit(1);
    }

    // Add the compiled JavaScript files from dist/
    console.log('  📁 Adding compiled JavaScript files...');
    archive.directory('dist/', 'dist/');

    // Add production node_modules (exclude large devDependencies like aws-sdk)
    if (fs.existsSync('node_modules')) {
        console.log('  📚 Adding node_modules (excluding devDependencies)...');
        
        // Get list of devDependencies to exclude
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const devDeps = Object.keys(packageJson.devDependencies || {});
        
        console.log(`  📦 Excluding ${devDeps.length} devDependencies: ${devDeps.join(', ')}`);
        
        // Add all node_modules except the large devDependencies
        const items = fs.readdirSync('node_modules');
        items.forEach(item => {
            const itemPath = `node_modules/${item}`;
            if (fs.statSync(itemPath).isDirectory() && !devDeps.includes(item)) {
                archive.directory(itemPath, `node_modules/${item}`);
            }
        });
        
    } else {
        console.warn('⚠️  node_modules not found. Run "npm install" first.');
    }

    // Add package.json (needed for Lambda runtime)
    if (fs.existsSync('package.json')) {
        console.log('  📄 Adding package.json...');
        archive.file('package.json', { name: 'package.json' });
    }

    // Add package-lock.json if it exists (helps with consistent installs)
    if (fs.existsSync('package-lock.json')) {
        console.log('  🔒 Adding package-lock.json...');
        archive.file('package-lock.json', { name: 'package-lock.json' });
    }

    // Finalize the archive
    await archive.finalize();
}

// Run the packaging
packageLambda().catch((error) => {
    console.error('💥 Packaging failed:', error);
    process.exit(1);
});
