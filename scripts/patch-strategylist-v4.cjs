// patch-strategylist-v4.cjs
// Fix remaining StrategyList.tsx issues:
// 1. Line 761: unclosed template literal cascading to line 772
// 2. Line 786: unterminated string literal "??}
const fs = require("fs");

const filePath = "src/components/StrategyList.tsx";
let content = fs.readFileSync(filePath, "utf8");
const hasCRLF = content.includes("\r\n");
content = content.split("\r\n").join("\n");
const lines = content.split("\n");
let changed = 0;

function fixLine(lineNo, oldContent, newContent, desc) {
  const idx = lineNo - 1;
  if (lines[idx] !== oldContent) {
    console.warn("MISMATCH line " + lineNo + ": " + desc);
    console.warn("  expected: " + JSON.stringify(oldContent.slice(0, 80)));
    console.warn("  got:      " + JSON.stringify(lines[idx].slice(0, 80)));
    return false;
  }
  lines[idx] = newContent;
  console.log("Fixed line " + lineNo + ": " + desc);
  changed++;
  return true;
}

// Fix 1: Line 761 – unclosed template literal
// x3f x3f = ?? before {s.threshGkLabel}, x3f x3f = ?? after }, x29 = ) no backtick
// Original: .map((s) => `??{s.threshGkLabel}??)
// Fixed:    .map((s) => `??${s.threshGkLabel}??`)
fixLine(
  761,
  "                              .map((s) => `\x3f\x3f{s.threshGkLabel}\x3f\x3f)",
  "                              .map((s) => `\x3f\x3f${s.threshGkLabel}\x3f\x3f`)",
  "restore $ in template expression and add closing backtick",
);

// Fix 2: Line 786 – unterminated string "??}
// Current: ??? {srcGk?.target ?? "??}
// Fixed:   目標 {srcGk?.target ?? "--"}
fixLine(
  786,
  '                                    \x3f\x3f\x3f {srcGk?.target ?? "\x3f\x3f}',
  '                                    目標 {srcGk?.target ?? "--"}',
  "restore target label and fix unterminated string",
);

if (hasCRLF) {
  content = lines.join("\r\n");
} else {
  content = lines.join("\n");
}
fs.writeFileSync(filePath, content, "utf8");
console.log("Done. " + changed + " fixes applied.");
