const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "versions.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const stable = data.stable || {};
if (!stable.id) {
  console.error("versions.json has no stable version id.");
  process.exit(1);
}

console.log("Stable version: " + stable.id);
if (stable.recorded) console.log("Recorded: " + stable.recorded);
if (stable.url) console.log("Site: " + stable.url);
if (stable.note) console.log(stable.note);

if (!process.argv.includes("--yes")) {
  console.log("");
  console.log("The live site is unchanged.");
  console.log("To put the live site back to this version, run:");
  console.log("  node rollback-stable.js --yes");
  process.exit(0);
}

const result = spawnSync("npx", ["wrangler", "rollback", stable.id], {
  cwd: __dirname,
  stdio: "inherit"
});
process.exit(result.status == null ? 1 : result.status);
