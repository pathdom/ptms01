const fs = require('fs');

const code = fs.readFileSync('js/main.js', 'utf8');
const lines = code.split('\n');

let braceCount = 0;
let parenCount = 0;
let inString = null;
let isComment = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Skip lines with regexes
  const skipBrackets = line.includes('.match(') || line.includes('.replace(') || line.includes('Regex') || line.includes('/^') || line.includes('split(');

  let isLineComment = false;
  const prevBrace = braceCount;
  const prevParen = parenCount;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const nextChar = line[j + 1];

    if (inString) {
      if (char === '\\') {
        j++;
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

    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      continue;
    }

    if (!skipBrackets) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
      } else if (char === '(') {
        parenCount++;
      } else if (char === ')') {
        parenCount--;
      }
    }
  }

  // Print if count changed
  if (braceCount !== prevBrace || parenCount !== prevParen) {
    if (i >= 11800) { // Focus on line 11800 to end
      console.log(`Line ${i + 1}: Braces: ${braceCount}, Parens: ${parenCount} | ${line.trim().substring(0, 60)}`);
    }
  }
}
