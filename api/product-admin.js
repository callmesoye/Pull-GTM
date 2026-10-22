import {createProductAdminHandler} from '../server/product-admin.js';
export default {fetch:request=>createProductAdminHandler()(request)};
