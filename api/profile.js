import {createBackend} from '../server/backend.js';
import {createProductAdminHandler} from '../server/product-admin.js';
// Reuse the existing profile function so the zero-budget Hobby deployment
// stays within its serverless function limit. Admin authorization is unchanged.
export default {fetch:request=>new URL(request.url).searchParams.get('staff')==='feedback'
  ? createProductAdminHandler()(request) : createBackend().profile(request)};
