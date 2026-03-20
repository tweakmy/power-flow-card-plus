const fs = require("node:fs");
const path = require("node:path");

const sourceFile = path.resolve(__dirname, "..", "dist", "power-flow-card-plus.js");
const targetDir =
  process.env.POWER_FLOW_DEPLOY_PATH ||
  "\\\\homeassistant\\config\\www\\community\\power-flow-card-plus";
const targetFile = path.join(targetDir, "power-flow-card-plus.js");

if (!fs.existsSync(sourceFile)) {
  console.error(`[deploy] Build output not found: ${sourceFile}`);
  process.exit(1);
}

if (!fs.existsSync(targetDir)) {
  console.error(`[deploy] Target path not reachable: ${targetDir}`);
  process.exit(1);
}

fs.copyFileSync(sourceFile, targetFile);

const stats = fs.statSync(targetFile);
console.log(`[deploy] Copied to ${targetFile} (${stats.size} bytes)`);
