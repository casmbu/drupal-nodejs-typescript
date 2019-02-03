/**
 * Node.js Integration for Drupal
 * https://www.drupal.org/project/nodejs
 */

import { DrupalServer } from './lib/server';
import { ConfigManager } from './lib/config-manager';

// tslint:disable-next-line:no-magic-numbers
const configFile = process.argv[2] ? process.argv[2] : process.cwd() + '/nodejs.config.js';

const packageInfo = require('../package.json');
global.version = packageInfo.version;

const configManager = new ConfigManager();
configManager.readFromDisk(configFile);
const server = new DrupalServer();
server.start(configManager);
