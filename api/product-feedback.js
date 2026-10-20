import {createProductFeedbackHandler} from '../server/product-feedback.js';
export default {fetch:request=>createProductFeedbackHandler()(request)};
