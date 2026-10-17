import {createAuth} from '../server/auth.js';

export default {fetch:request=>createAuth()(request)};
