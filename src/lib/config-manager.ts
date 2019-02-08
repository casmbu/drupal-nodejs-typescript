/**
 * Submodule for managing configuration.
 */

import { runInThisContext } from 'vm';
import { readFileSync } from 'fs';
import { Logger } from './utility';
import { IDrupalNodejsExtension, DrupalNodejsExtensionCallable } from './extension-interface';
import { IDrupalNodejsRoute } from './routes';

const actualRequire: (module: string) => { default: FunctionConstructor } = typeof __webpack_require__ === 'function' ? __non_webpack_require__ : require;

export type Scheme = 'http' | 'https';
export type ioTransport = 'websocket' | 'polling';

export interface IDrupalBackendSettings {
  host: string;
  scheme: Scheme;
  port: number;
  basePath: string;
  strictSSL: boolean;
  messagePath: string;
  httpAuth: string;
}
class DrupalBackendSettings implements IDrupalBackendSettings {
  public readonly host = 'localhost';
  public readonly scheme = 'http';
  public readonly port = 80;
  public readonly basePath = '/';
  public readonly strictSSL = false;
  public readonly messagePath = 'nodejs/message';
  public readonly httpAuth = '';

  constructor(settings: IDrupalBackendSettings = {} as IDrupalBackendSettings) {
    Object.assign(this, settings);
  }
}

export interface IDrupalNodejsSettings {
  scheme: Scheme;
  port: number;
  host: string;
  resource: string;
  serviceKey: string;
  debug: boolean;
  showLogs: boolean;
  baseAuthPath: string;
  extensions: string[];
  clientsCanWriteToChannels: boolean;
  clientsCanWriteToClients: boolean;
  transports: ioTransport[];
  jsMinification: boolean;
  jsEtag: boolean;
  sslKeyPath?: string;
  sslCertPath?: string;
  sslCAPath?: string;
  sslPassPhrase?: string;
  logLevel: number;
}
class DrupalNodejsSettings implements IDrupalNodejsSettings {
  public readonly scheme = 'http';
  public readonly port = 8080;
  public readonly host = 'localhost';
  public readonly resource = '/socket.io';
  public readonly serviceKey = '';
  public readonly debug = true;
  public readonly showLogs = true;
  public readonly baseAuthPath = '/nodejs/';
  public readonly extensions = [];
  public readonly clientsCanWriteToChannels = false;
  public readonly clientsCanWriteToClients = false;
  public readonly transports = ['websocket', 'polling'] as ioTransport[];
  public readonly jsMinification = true;
  public readonly jsEtag = true;
  public readonly sslKeyPath = '';
  public readonly sslCertPath = '';
  public readonly sslCAPath = '';
  public readonly sslPassPhrase = '';
  public readonly logLevel = 1;

  constructor(settings: IDrupalNodejsSettings = {} as IDrupalNodejsSettings) {
    Object.assign(this, settings);
  }
}

export class ConfigManager {
  public readonly nodeSettings: DrupalNodejsSettings;
  public readonly backendSettings: DrupalBackendSettings;
  extensions: IDrupalNodejsExtension[] = [];
  private readonly logger: Logger;

  constructor(configFile: string);
  constructor(nodeSettings: IDrupalNodejsSettings, backendSettings: IDrupalBackendSettings);
  constructor(
    configFileOrNodeSettings: string | IDrupalNodejsSettings,
    backendSettings?: IDrupalBackendSettings,
  ) {
    if (typeof configFileOrNodeSettings === 'string') {
      // Reads in settings from a file.
      let settings;
      try {
        settings = runInThisContext(readFileSync(configFileOrNodeSettings, 'utf8'));
      }
      catch (exception) {
        // tslint:disable-next-line:no-console
        console.error(`Failed to read config file, exiting: ${exception}`);
        process.exit(1);
      }
      this.backendSettings = new DrupalBackendSettings(settings.backend);
      delete settings.backend;
      this.nodeSettings = new DrupalNodejsSettings(settings);
    }
    else if (configFileOrNodeSettings && backendSettings) {
      this.nodeSettings = new DrupalNodejsSettings(configFileOrNodeSettings);
      this.backendSettings = new DrupalBackendSettings(backendSettings);
    }
    else {
      throw new Error('Invalid settings');
    }

    this.logger = new Logger(this.nodeSettings);

    // Allow extensions to react to settings.
    this.loadExtensions();
    const newSettings: IDrupalNodejsSettings & {
      backend: IDrupalBackendSettings;
    } = {
      ...this.nodeSettings,
      backend: {
        ...this.backendSettings,
      },
    };
    this.invokeExtensions('alterSettings', newSettings);
    this.backendSettings = new DrupalBackendSettings(newSettings.backend);
    delete newSettings.backend;
    this.nodeSettings = new DrupalNodejsSettings(newSettings);
  }

  /**
   * Returns the Nodejs settings object.
   */
  getNodeSettings(): IDrupalNodejsSettings {
    return this.nodeSettings;
  }

  /**
   * Returns the Drupal backend settings object.
   */
  getBackendSettings(): IDrupalBackendSettings {
    return this.backendSettings;
  }

  /**
   * Loads extensions.
   */
  loadExtensions() {
    this.nodeSettings.extensions.forEach((extension) => {
      try {
        // Load JS files for extensions as modules, and collect the returned
        // object for each extension.
        const extensionModule = actualRequire(`${__dirname}/extensions/${extension}`).default;
        this.extensions.push((new extensionModule() as unknown) as IDrupalNodejsExtension);
        this.logger.log(`Extension loaded: ${extension}`);
      }
      catch (exception) {
        throw new Error(`Failed to load extension ${extension} [${exception}]`);
      }
    });
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
    const routes: IDrupalNodejsRoute[] = [];

    let authPrefix = this.nodeSettings.baseAuthPath;
    // Remove trailing slash.
    authPrefix = authPrefix.substring(0, authPrefix.length - 1);

    this.extensions.forEach((extension) => {
      const extensionRoutes = extension.routes || [];
      if (extensionRoutes.length > 0) {
        this.logger.log('Adding route handlers from extension', extensionRoutes);

        for (let j = 0; j < extensionRoutes.length; j++) {
          let path = '';

          if (extensionRoutes[j].auth) {
            path = authPrefix + extensionRoutes[j].path;
          }
          else {
            path = extensionRoutes[j].path;
          }

          routes.push({
            path,
            type: extensionRoutes[j].type,
            handler: extensionRoutes[j].handler,
          });
        }
      }
    });

    return routes;
  }

  /**
   * Invokes the specified function on all registered server extensions.
   */
  invokeExtensions(hook: DrupalNodejsExtensionCallable, ...args: any[]) {
    const returnValues: any[] = [];
    this.extensions.forEach((extension) => {
      if (
        extension[hook] instanceof Function
        && (extension[hook] as Function).apply
      ) {
        const func = extension[hook] as Function;
        returnValues[this.extensions.indexOf(extension)] = func.apply(extension, args);
      }
      else {
        this.logger.debug(`${extension.constructor.name} does not implement ${hook}`);
      }
    });

    return returnValues;
  }
}
