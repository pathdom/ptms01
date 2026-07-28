const fs = require('fs');

const code = fs.readFileSync('js/main.js', 'utf8');
const lines = code.split('\n');

let braceCount = 0;
let parenCount = 0;
let inString = null; // '"', "'", "`"
let isComment = false;
let isLineComment = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const nextChar = line[j + 1];

    if (inString) {
      if (char === '\\') {
        j++; // skip escaped char
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (isComment) {
      if (char === '*' && nextChar === '/') {
        isComment = false;
        j++;
      }
      continue;
    }

    if (isLineComment) {
      // Line comment ends at end of line, so skip rest of string
      break;
    }

    if (char === '/' && nextChar === '/') {
      isLineComment = true;
      j++;
      break;
    }

    if (char === '/' && nextChar === '*') {
      isComment = true;
      j++;
      continue;
    }

    // Check strings
    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      continue;
    }

    // Count braces and parens
    if (char === '{') {
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount < 0) {
        console.log(`Unmatched } at line ${i + 1}, column ${j + 1}`);
        process.exit(1);
      }
    } else if (char === '(') {
      parenCount++;
    } else if (char === ')') {
      parenCount--;
      if (parenCount < 0) {
        console.log(`Unmatched ) at line ${i + 1}, column ${j + 1}`);
        process.exit(1);
      }
    }
  }
  isLineComment = false;
}

console.log(`Finished checking. Brace balance: ${braceCount}, Paren balance: ${parenCount}`);
if (braceCount !== 0 || parenCount !== 0) {
  console.log("File is unbalanced!");
} else {
  console.log("File is balanced!");
}
