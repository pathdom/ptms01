const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\ad\\.gemini\\antigravity-ide\\brain\\0258e712-f419-433c-9da1-044464102ec9';
const destDir = __dirname;

const files = {
  'japan_news_thumbnail_1779983001674.png': 'japan_news_thumbnail.png',
  'korea_news_thumbnail_1779983022452.png': 'korea_news_thumbnail.png',
  'taiwan_news_thumbnail_1779983043419.png': 'taiwan_news_thumbnail.png'
};

Object.entries(files).forEach(([srcName, destName]) => {
  const srcPath = path.join(srcDir, srcName);
  const destPath = path.join(destDir, destName);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Successfully copied ${srcName} to ${destName}`);
  } else {
    console.warn(`Source file not found: ${srcPath}`);
  }
});
