const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

async function generateIcons() {
  const logoPath = path.join(__dirname, '../public/logo.png');
  const outputDir = path.join(__dirname, '../public/icons');
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const logo = await loadImage(logoPath);
  
  const sizes = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];
  
  for (const { name, size } of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Blue gradient background (matching login page)
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#2563eb'); // blue-600
    gradient.addColorStop(1, '#4338ca'); // indigo-700
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    // Calculate logo size (80% of icon size with padding)
    const padding = size * 0.1;
    const logoSize = size - (padding * 2);
    
    // Draw logo centered
    ctx.drawImage(logo, padding, padding, logoSize, logoSize);
    
    // Save to file
    const buffer = canvas.toBuffer('image/png');
    const outputPath = path.join(outputDir, name);
    fs.writeFileSync(outputPath, buffer);
    console.log(`Generated: ${name} (${size}x${size})`);
  }
  
  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);
