import {createAutomationsBackend} from '../server/automations.js';

export default {fetch:request=>createAutomationsBackend()(request)};
