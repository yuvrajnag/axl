import fs from 'fs';
import path from 'path';

const outDir = 'test-projects/massive/flow';
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'app.flow'), `
APP Massive
NAME "Massive"
VERSION 1.0.0
DESCRIPTION "Massive Project"
FRAMEWORK Express
LANGUAGE TypeScript
DATABASE PostgreSQL
BASE_URL https://api.massive.com
`);

let schema = "";
let actions = "";
let workflows = "";
let auth = "";

for(let i=1; i<=100; i++) {
  schema += `ENTITY Entity${i}\n  id : String\n  name : String\n\n`;
}

for(let i=1; i<=500; i++) {
  actions += `ACTION action${i}\n  DESC "Action ${i}"\n  INPUT\n    id : String REQUIRED\n  OUTPUT Entity1\n  ENDPOINT POST /api/${i}\n\n`;
  auth += `PERMISSION action${i} : PUBLIC\n`;
}

for(let i=1; i<=100; i++) {
  workflows += `WORKFLOW workflow${i}\n  STEP action1\n  STEP action2\nEND\n\n`;
}

fs.writeFileSync(path.join(outDir, 'schema.flow'), schema);
fs.writeFileSync(path.join(outDir, 'actions.flow'), actions);
fs.writeFileSync(path.join(outDir, 'workflows.flow'), workflows);
fs.writeFileSync(path.join(outDir, 'auth.flow'), auth);

console.log("Massive project generated.");
