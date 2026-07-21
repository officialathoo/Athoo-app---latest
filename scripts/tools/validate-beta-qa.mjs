import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  '.maestro/customer-login.yaml',
  '.maestro/provider-login.yaml',
  'docs/qa/CLOSED_BETA_CHECKLIST.md',
  'docs/runbooks/MOBILE_BETA_RELEASE_RUNBOOK.md',
];
const requiredMarkers = {
  'athoo-app/app/auth/welcome.tsx': ['welcome-screen','welcome-sign-in','welcome-sign-up'],
  'athoo-app/app/auth/choose-role.tsx': ['auth-${mode}-customer','auth-${mode}-provider'],
  'athoo-app/app/auth/login.tsx': ['login-password-tab','login-identifier','login-password','login-submit'],
  'admin-panel/src/pages/LoginPage.tsx': ['admin-login-identifier','admin-login-password','admin-login-submit'],
};
const errors = [];
for (const file of requiredFiles) if (!fs.existsSync(path.join(root,file))) errors.push(`Missing ${file}`);
for (const [file, markers] of Object.entries(requiredMarkers)) {
  const full=path.join(root,file);
  const text=fs.existsSync(full)?fs.readFileSync(full,'utf8'):'';
  for (const marker of markers) if (!text.includes(marker)) errors.push(`${file} missing ${marker}`);
}
for (const flow of ['.maestro/customer-login.yaml','.maestro/provider-login.yaml']) {
  const text=fs.readFileSync(path.join(root,flow),'utf8');
  if (!text.includes('clearState: true')) errors.push(`${flow} must isolate app state`);
  if (!text.includes('${ATHOO_APP_ID}')) errors.push(`${flow} must use ATHOO_APP_ID`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Closed-beta QA assets validated.');
