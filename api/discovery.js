import {createBackend} from '../server/backend.js';
export default async function handler(request){return createBackend().discovery(request);}
