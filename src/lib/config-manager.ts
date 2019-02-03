/**
 * Submodule for managing configuration.
 */

import { runInThisContext } from 'vm';
import { readFileSync } from 'fs';
import { Logger } from './utility';

export class ConfigManager {
  settings: any = undefined;
  extensions: any = [];
  settingsDefaults: any = {
    scheme: 'http',
    port: 8080,
    host: 'localhost',
    resource: '/socket.io',
    serviceKey: '',
    debug: true,
    showLogs: true,
    baseAuthPath: '/nodejs/',
    extensions: [],
    clientsCanWriteToChannels: false,
    clientsCanWriteToClients: false,
    transports: ['websocket', 'polling'],
    jsMinification: true,
    jsEtag: true,
    backend: {
      host: 'localhost',
      scheme: 'http',
      port: 80,
      basePath: '/',
      strictSSL: false,
      messagePath: 'nodejs/message',
      httpAuth: '',
    },
  };
  logger: Logger;

  constructor() {
    this.logger = new Logger(this.settingsDefaults);
  }

  /**
   * Returns the settings array.
   */
  getSettings() {
    return this.settings;
  }

  /**
   * Sets the settings array.
   */
  setSettings(settings: any) {
    this.settings = settings;
    this.initSettings();
    this.logger = new Logger(this.settings);
  }

  /**
   * Reads in settings from a file.
   */
  readFromDisk(configFile: any) {
    try {
      this.setSettings(runInThisContext(readFileSync(configFile, 'utf8')));
    }
    catch (exception) {
      this.logger.log(`Failed to read config file, exiting: ${exception}`);
      process.exit(1);
    }
  }

  /**
   * Merge in default settings, allow extensions to react.
   */
  initSettings() {
    for (const key in this.settingsDefaults) {
      if (this.settingsDefaults.hasOwnProperty(key) && key !== 'backend' && !this.settings.hasOwnProperty(key)) {
        this.settings[key] = this.settingsDefaults[key];
      }
    }

    if (!this.settings.hasOwnProperty('backend')) {
      this.settings.backend = this.settingsDefaults.backend;
    }
    else {
      for (const key2 in this.settingsDefaults.backend) {
        if (
          this.settingsDefaults.backend.hasOwnProperty(key2)
          && !this.settings.backend.hasOwnProperty(key2)
        ) {
          this.settings.backend[key2] = this.settingsDefaults.backend[key2];
        }
      }
    }

    this.loadExtensions();
    this.invokeExtensions('alterSettings', this.settings);
  }

  /**
   * Loads extensions.
   */
  loadExtensions() {
    for (const i in this.settings.extensions) {
      if (this.settings.extensions.hasOwnProperty(i)) {
        try {
          // Load JS files for extensions as modules, and collect the returned
          // object for each extension.
          this.extensions.push(
            require(`${__dirname}/../extensions/${this.settings.extensions[i]}`),
          );
          this.logger.log(`Extension loaded: ${this.settings.extensions[i]}`);
        }
        catch (exception) {
          this.logger.log(`Failed to load extension ${this.settings.extensions[i]} [${exception}]`);
          process.exit(1);
        }
      }
    }
  }

  /**
   * Retrieves paths defined by extensions.
   *
   * @returns {Array}
   *   Array of routes. Each route has the following properties:
   *     path: The path to use in routes.
   *     type: 'get' or 'post'.
   *     handler: Callback function.
   */
  getExtensionRoutes() {
    const routes = [];

    let authPrefix = this.settings.baseAuthPath;
    // Remove trailing slash.
    authPrefix = authPrefix.substring(0, authPrefix.length - 1);

    for (const i in this.extensions) {
      if (this.extensions[i].hasOwnProperty('routes')) {
        this.logger.log('Adding route handlers from extension', this.extensions[i].routes);

        for (let j = 0; j < this.extensions[i].routes.length; j++) {
          let path = '';

          if (this.extensions[i].routes[j].auth) {
            path = authPrefix + this.extensions[i].routes[j].path;
          }
          else {
            path = this.extensions[i].routes[j].path;
          }

          routes.push({
            path,
            type: (this.extensions[i].routes[j].type === 'post' ? 'post' : 'get'),
            handler: this.extensions[i].routes[j].handler,
          });
        }
      }
    }

    return routes;
  }

  /**
   * Invokes the specified function on all registered server extensions.
   */
  invokeExtensions(hook: any, ...args: any[]) {
    const returnValues: any = {};
    for (const i in this.extensions) {
      if (
        this.extensions.hasOwnProperty(i)
        && this.extensions[i].hasOwnProperty(hook)
        && this.extensions[i][hook].apply
      ) {
        returnValues[i] = this.extensions[i][hook].apply(this, args);
      }
    }
    return returnValues;
  }
}
