/*
* Submodule for setting up the server.
*/

import express from 'express';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { createServer as _createServer } from 'https';
import { json } from 'body-parser';
import { Routes } from './routes';
import { Backend } from './backend';
import { ClientManager } from './client-manager';
import { ConfigManager, ioTransport } from './config-manager';
import { Logger } from './utility';

export class DrupalServer {
  /**
   * Starts the server.
   */
  static start(configManager: ConfigManager) {
    const nodeSettings = configManager.getNodeSettings();
    const backendSettings = configManager.getBackendSettings();
    const app = express();

    const backend = new Backend(nodeSettings, backendSettings);
    const clientManager = new ClientManager(nodeSettings, backend);

    const logger = new Logger(nodeSettings);

    // Allow extensions to  override route callbacks.
    configManager.invokeExtensions('alterRoutes', Routes);

    app.use(json());

    app.use((req, res, next) => {
      // Make objects available to route callbacks.
      // (Needed because route callbacks cannot access properties via the 'this' keyword.)
      req.clientManager = clientManager;
      next();
    });

    app.all(nodeSettings.baseAuthPath + '*', Routes.checkServiceKey);
    app.post(nodeSettings.baseAuthPath + 'publish', Routes.publishMessage);
    app.post(nodeSettings.baseAuthPath + 'user/kick/:uid', Routes.kickUser);
    app.post(nodeSettings.baseAuthPath + 'user/logout/:authtoken', Routes.logoutUser);
    app.post(nodeSettings.baseAuthPath + 'user/channel/add/:channel/:uid', Routes.addUserToChannel);
    app.post(nodeSettings.baseAuthPath + 'user/channel/remove/:channel/:uid', Routes.removeUserFromChannel);
    app.post(nodeSettings.baseAuthPath + 'channel/add/:channel', Routes.addChannel);
    app.get(nodeSettings.baseAuthPath + 'health/check', Routes.healthCheck);
    app.get(nodeSettings.baseAuthPath + 'channel/check/:channel', Routes.checkChannel);
    app.post(nodeSettings.baseAuthPath + 'channel/remove/:channel', Routes.removeChannel);
    app.get(nodeSettings.baseAuthPath + 'user/presence-list/:uid/:uidList', Routes.setUserPresenceList);
    app.post(nodeSettings.baseAuthPath + 'debug/toggle', Routes.toggleDebug);
    app.post(nodeSettings.baseAuthPath + 'content/token/users', Routes.getContentTokenUsers);
    app.post(nodeSettings.baseAuthPath + 'content/token', Routes.setContentToken);
    app.post(nodeSettings.baseAuthPath + 'content/token/message', Routes.publishMessageToContentChannel);
    app.post(nodeSettings.baseAuthPath + 'authtoken/channel/add/:channel/:authToken', Routes.addAuthTokenToChannel);
    app.post(nodeSettings.baseAuthPath + 'authtoken/channel/remove/:channel/:authToken', Routes.removeAuthTokenFromChannel);

    // Allow extensions to add routes.
    const extensionRoutes = configManager.getExtensionRoutes();
    extensionRoutes.forEach((route) => {
      if (route.type === 'post') {
        app.post(route.path, route.handler);
      }
      else {
        app.get(route.path, route.handler);
      }
    });

    app.get('*', Routes.send404);

    let httpServer;
    if (nodeSettings.scheme === 'https') {
      if (!nodeSettings.sslKeyPath) throw new Error('sslKeyPath not specified');
      if (!nodeSettings.sslCertPath) throw new Error('sslCertPath not specified');

      const sslOptions: {
        key: Buffer,
        cert: Buffer,
        ca?: Buffer,
        passphrase?: string,
      } = {
        key: readFileSync(nodeSettings.sslKeyPath),
        cert: readFileSync(nodeSettings.sslCertPath),
      };
      if (nodeSettings.sslCAPath) {
        sslOptions.ca = readFileSync(nodeSettings.sslCAPath);
      }
      if (nodeSettings.sslPassPhrase) {
        sslOptions.passphrase = nodeSettings.sslPassPhrase;
      }
      httpServer = _createServer(sslOptions, app);
    }
    else {
      httpServer = createServer(app);
    }

    httpServer.listen(nodeSettings.port, nodeSettings.host);
    logger.log(`Started ${nodeSettings.scheme} server.`);

    const ioOptions: {
      transports: ioTransport[],
      'log level': number,
      port: number,
      'browser client etag'?: boolean,
      'browser client minification'?: boolean,
    } = {
      transports: nodeSettings.transports,
      'log level': nodeSettings.logLevel,
      port: nodeSettings.port,
    };

    if (nodeSettings.jsEtag) {
      ioOptions['browser client etag'] = true;
    }
    if (nodeSettings.jsMinification) {
      ioOptions['browser client minification'] = true;
    }

    const io = require('socket.io')(httpServer, ioOptions);

    io.set('resource', nodeSettings.resource);
    io.set('transports', nodeSettings.transports);

    io.on(
      'connection',
      (socket: any) => {
        clientManager.addSocket(socket);
      },
    ).on(
      'error',
      (exception: any) => {
        logger.debug(`Socket error [${exception}]`);
      },
    );

    // The extensions will have access to all connection data via the
    // clientManager object. They can also access .settings and .backend via the
    // clientManager.
    configManager.invokeExtensions('setup', clientManager);
  }
}
