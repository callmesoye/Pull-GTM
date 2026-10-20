import {createProductEventHandler} from '../server/product-events.js';
export default {fetch:request=>createProductEventHandler()(request)};
