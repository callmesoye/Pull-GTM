import {createGoogleAuth} from '../server/auth.js';

export default {fetch:request=>createGoogleAuth()(request)};
