import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { releaseConfig, validateReleaseConfig, validateReleaseEnvironment } from "../mobile/lib/release-config.ts";

const requirements = {
  backend: "Apply migrations, deploy functions, and record a successful live disposable-account deletion and consent test.",
  publicPages: "Verify privacy and support URLs open over HTTPS without authentication and show final contact details.",
  providers: "Identify authentication SMTP and verify every provider's production retention/training settings; finalize the privacy policy.",
  privacyLabels: "Review actual production data flows and complete App Privacy answers.",
  contentRights: "Record distribution rights/terms for music previews, artwork, articles, images and fonts.",
  signedDevices: "Test the signed release on supported physical iPhone/iPad devices; record build, devices, OS versions and outcomes.",
  archive: "Inspect signing, SDK version, entitlements and aggregated privacy manifests in the production archive.",
  review: "Prepare App Store listing, age rating, screenshots and a tested review account; store credentials privately, never here.",
};
const errors = validateReleaseConfig(releaseConfig);
let env = {};
for (const path of ["../.env", "../.env.local", "../mobile/.env", "../mobile/.env.local"]) {
  try { env = { ...env, ...parseEnv(readFileSync(new URL(path, import.meta.url), "utf8")) }; }
  catch (error) { if (error.code !== "ENOENT") errors.push(`Cannot read ${path}; check file format and permissions.`); }
}
errors.push(...validateReleaseEnvironment({ ...env, ...process.env }));
let evidence = {};
try {
  evidence = JSON.parse(readFileSync(new URL("../release-evidence.json", import.meta.url), "utf8"));
} catch {
  errors.push("Create release-evidence.json from release-evidence.example.json with references to completed checks.");
}
for (const [key, instruction] of Object.entries(requirements)) {
  if (typeof evidence?.[key] !== "string" || !evidence[key].trim()) errors.push(`${key}: ${instruction}`);
}
if (errors.length) {
  console.error("Release preflight blocked:\n" + errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Release configuration and evidence references are present. This does not verify their truth, URL availability, or Apple approval. Review the evidence before submission.");
}
