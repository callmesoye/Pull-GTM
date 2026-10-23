import {createBackend} from '../server/backend.js';
export default {fetch:request=>createBackend().buyerRequests(request)};
