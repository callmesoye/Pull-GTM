import { v2Boundary } from '../server/v2-boundary.js';

if (!v2Boundary(process.env, { requireDeployment: true }).ok) {
  console.error('Pull V2 needs its dedicated Vercel project, HTTPS app origin, and separate Supabase project. Deployment stopped.');
  process.exitCode = 1;
}
