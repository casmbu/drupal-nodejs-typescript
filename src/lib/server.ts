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
import { ConfigManager } from './config-manager';
import { Logger } from './utility';

export class DrupalServer {
  /**
   * Starts the server.
   */
  start(configManager: ConfigManager) {
    const settings = configManager.getSettings();
    const app = express();

    const backend = new Backend(settings);
    const clientManager = new ClientManager(settings, backend);
    const routes = new Routes();

    const logger = new Logger(settings);

    // Allow extensions to  override route callbacks.
    configManager.invokeExtensions('alterRoutes', routes);

    app.use(json({}));

    app.use((request: any, response: any, next: any) => {
      // Make objects available to route callbacks.
      // (Needed because route callbacks cannot access properties via the 'this' keyword.)
      request.clientManager = clientManager;
      next();
    });

    app.all(settings.baseAuthPath + '*', routes.checkServiceKey);
    app.post(settings.baseAuthPath + 'publish', routes.publishMessage);
    app.post(settings.baseAuthPath + 'user/kick/:uid', routes.kickUser);
    app.post(settings.baseAuthPath + 'user/logout/:authtoken', routes.logoutUser);
    app.post(settings.baseAuthPath + 'user/channel/add/:channel/:uid', routes.addUserToChannel);
    app.post(settings.baseAuthPath + 'user/channel/remove/:channel/:uid', routes.removeUserFromChannel);
    app.post(settings.baseAuthPath + 'channel/add/:channel', routes.addChannel);
    app.get(settings.baseAuthPath + 'health/check', routes.healthCheck);
    app.get(settings.baseAuthPath + 'channel/check/:channel', routes.checkChannel);
    app.post(settings.baseAuthPath + 'channel/remove/:channel', routes.removeChannel);
    app.get(settings.baseAuthPath + 'user/presence-list/:uid/:uidList', routes.setUserPresenceList);
    app.post(settings.baseAuthPath + 'debug/toggle', routes.toggleDebug);
    app.post(settings.baseAuthPath + 'content/token/users', routes.getContentTokenUsers);
    app.post(settings.baseAuthPath + 'content/token', routes.setContentToken);
    app.post(settings.baseAuthPath + 'content/token/message', routes.publishMessageToContentChannel);
    app.post(settings.baseAuthPath + 'authtoken/channel/add/:channel/:authToken', routes.addAuthTokenToChannel);
    app.post(settings.baseAuthPath + 'authtoken/channel/remove/:channel/:authToken', routes.removeAuthTokenFromChannel);

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

    app.get('*', routes.send404);

    let httpServer;
    if (settings.scheme === 'https') {
      const sslOptions: any = {
        key: readFileSync(settings.sslKeyPath),
        cert: readFileSync(settings.sslCertPath),
      };
      if (settings.sslCAPath) {
        sslOptions.ca = readFileSync(settings.sslCAPath);
      }
      if (settings.sslPassPhrase) {
        sslOptions.passphrase = settings.sslPassPhrase;
      }
      httpServer = _createServer(sslOptions, app);
    }
    else {
      httpServer = createServer(app);
    }

    httpServer.listen(settings.port, settings.host);
    logger.log(`Started ${settings.scheme} server.`);

    const ioOptions: any = {};
    ioOptions['transports'] = settings.transports;
    ioOptions['log level'] = settings.logLevel;
    ioOptions['port'] = settings.port;

    if (settings.jsEtag) {
      ioOptions['browser client etag'] = true;
    }
    if (settings.jsMinification) {
      ioOptions['browser client minification'] = true;
    }

    const io = require('socket.io')(httpServer, ioOptions);

    io.set('resource', settings.resource);
    io.set('transports', settings.transports);

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
