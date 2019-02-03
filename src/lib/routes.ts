/**
 * Submodule for router callbacks.
 */

export class Routes {
  /**
   * Constructor.
   */
  constructor() {
    // Dependencies are injected by a middleware into the request object in each route callback.
    // Available objects:
    //   - request.clientManager
    //   - request.clientManager.backend
    //   - request.clientManager.settings
  }

  /**
   * Callback that wraps all requests and checks for a valid service key.
   */
  checkServiceKey(request: any, response: any, next: any) {
    request.clientManager.logger.debug('Route callback: checkServiceKey');

    if (request.clientManager.backend.checkServiceKey(request.header('NodejsServiceKey', ''))) {
      next();
    }
    else {
      response.send({ error: 'Invalid service key.' });
    }
  }

  /**
   * Http callback - read in a JSON message and publish it to interested clients.
   */
  publishMessage(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: publishMessage');
    request.clientManager.logger.debug('Body', request.body);

    if (!request.body.channel && !request.body.broadcast) {
      response.send({ error: 'Required parameters are missing.' });
      return;
    }

    let sentCount = 0;

    if (request.body.broadcast) {
      request.clientManager.broadcastMessage(request.body);
      sentCount = request.clientManager.getSocketCount();
    }
    else {
      sentCount = request.clientManager.publishMessageToChannel(request.body);
    }

    process.emit('message-published', request.body, sentCount);
    response.send({ status: 'success', sent: sentCount });
  }

  /**
   * Kicks the given logged in user from the server.
   */
  kickUser(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: kickUser');

    if (request.params.uid) {
      request.clientManager.kickUser(request.params.uid);
      response.send({ status: 'success' });
      return;
    }

    request.clientManager.logger.log('Failed to kick user, no uid supplied');

    response.send({ status: 'failed', error: 'missing uid' });
  }

  /**
   * Logout the given user from the server.
   */
  logoutUser(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: logoutUser');

    const authToken = request.params.authtoken || '';
    if (authToken) {
      request.clientManager.logger.log('Logging out http session ' + authToken);

      request.clientManager.kickUser(authToken);
      response.send({ status: 'success' });
      return;
    }

    request.clientManager.logger.log('Failed to logout user, no authToken supplied');

    response.send({ status: 'failed', error: 'missing authToken' });
  }

  /**
   * Add a user to a channel.
   */
  addUserToChannel(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: addUserToChannel');

    const uid = request.params.uid || '';
    const channel = request.params.channel || '';

    if (uid && channel) {
      if (!/^\d+$/.test(uid)) {
        request.clientManager.logger.log('Invalid uid: ' + uid);
        response.send({ status: 'failed', error: 'Invalid uid.' });
        return;
      }
      if (!/^[a-z0-9_]+$/i.test(channel)) {
        request.clientManager.logger.log('Invalid channel: ' + channel);
        response.send({ status: 'failed', error: 'Invalid channel name.' });
        return;
      }

      const result = request.clientManager.addUserToChannel(channel, uid);
      if (result) {
        response.send({ status: 'success' });
      }
      else {
        response.send({ status: 'failed', error: 'No active sessions for uid.' });
      }
    }
    else {
      request.clientManager.logger.log('Missing uid or channel');
      response.send({ status: 'failed', error: 'Missing uid or channel' });
    }
  }

  /**
   * Remove a user from a channel.
   */
  removeUserFromChannel(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: removeUserFromChannel');

    const uid = request.params.uid || '';
    const channel = request.params.channel || '';
    if (uid && channel) {
      if (!/^\d+$/.test(uid)) {
        request.clientManager.logger.log('Invalid uid: ' + uid);
        response.send({ status: 'failed', error: 'Invalid uid.' });
        return;
      }
      if (!/^[a-z0-9_]+$/i.test(channel)) {
        request.clientManager.logger.log('Invalid channel: ' + channel);
        response.send({ status: 'failed', error: 'Invalid channel name.' });
        return;
      }

      const result = request.clientManager.removeUserFromChannel(channel, uid);
      if (result) {
        response.send({ status: 'success' });
      }
      else {
        response.send({ status: 'failed', error: 'Non-existent channel name.' });
      }
    }
    else {
      request.clientManager.logger.log('Missing uid or channel');
      response.send({ status: 'failed', error: 'Invalid data' });
    }
  }

  /**
   * Add a channel.
   */
  addChannel(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: addChannel');

    const channel = request.params.channel || '';
    if (channel) {
      if (!/^[a-z0-9_]+$/i.test(channel)) {
        request.clientManager.logger.log('Invalid channel: ' + channel);
        response.send({ status: 'failed', error: 'Invalid channel name.' });
        return;
      }

      const result = request.clientManager.addChannel(channel);
      if (result) {
        response.send({ status: 'success' });
      }
      else {
        response.send({ status: 'failed', error: "Channel name '" + channel + "' already exists." });
      }
    }
    else {
      request.clientManager.logger.log('Missing channel');
      response.send({ status: 'failed', error: 'Invalid data: missing channel' });
    }
  }

  /**
   * Http callback - read in a JSON message and publish it to interested clients.
   */
  healthCheck(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: healthCheck');

    const data = request.clientManager.getStats();
    data.status = 'success';
    data.version = global.version;
    response.send(data);
  }

  /**
   * Checks whether a channel exists.
   */
  checkChannel(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: checkChannel');

    const channel = request.params.channel || '';
    if (channel) {
      if (!/^[a-z0-9_]+$/i.test(channel)) {
        request.clientManager.logger.log('Invalid channel: ' + channel);
        response.send({ status: 'failed', error: 'Invalid channel name.' });
        return;
      }

      const result = request.clientManager.checkChannel(channel);

      if (result) {
        response.send({ status: 'success', result: true });
      }
      else {
        response.send({ status: 'success', result: false });
      }
    }
    else {
      request.clientManager.logger.log('Missing channel');
      response.send({ status: 'failed', error: 'Invalid data: missing channel' });
    }
  }

  /**
   * Remove a channel.
   */
  removeChannel(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: removeChannel');

    const channel = request.params.channel || '';
    if (channel) {
      if (!/^[a-z0-9_]+$/i.test(channel)) {
        request.clientManager.logger.log('Invalid channel: ' + channel);
        response.send({ status: 'failed', error: 'Invalid channel name.' });
        return;
      }

      const result = request.clientManager.removeChannel(channel);
      if (result) {
        response.send({ status: 'success' });
      }
      else {
        response.send({ status: 'failed', error: 'Non-existent channel name.' });
      }
    }
    else {
      request.clientManager.logger.log('Missing channel');
      response.send({ status: 'failed', error: 'Invalid data: missing channel' });
    }
  }

  /**
   * Set the list of users a uid can see presence info about.
   */
  setUserPresenceList(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: setUserPresenceList');

    const uid = request.params.uid || '';
    const uidlist = request.params.uidlist.split(',') || [];
    if (uid && uidlist) {
      if (!/^\d+$/.test(uid)) {
        request.clientManager.logger.log('Invalid uid: ' + uid);
        response.send({ status: 'failed', error: 'Invalid uid.' });
        return;
      }
      if (uidlist.length === 0) {
        request.clientManager.logger.log('Empty uidlist');
        response.send({ status: 'failed', error: 'Empty uid list.' });
        return;
      }

      const result = request.clientManager.setUserPresenceList(uid, uidlist);
      if (result) {
        response.send({ status: 'success' });
      }
      else {
        response.send({ status: 'failed', error: 'Invalid uid.' });
      }
    }
    else {
      response.send({ status: 'failed', error: 'Invalid parameters.' });
    }
  }

  /**
   * Http callback - return the list of content channel users.
   */
  getContentTokenUsers(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: getContentTokenUsers');
    request.clientManager.logger.debug('Body', request.body);

    if (!request.body.channel) {
      response.send({ error: 'Required parameters are missing.' });
      return;
    }

    const users = request.clientManager.getContentTokenChannelUsers(request.body.channel);
    request.clientManager.logger.debug('users', users);

    response.send({ users });
  }

  /**
   * Set a content token.
   */
  setContentToken(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: setContentToken');
    request.clientManager.logger.debug('Body', request.body);

    if (!request.body.channel || !request.body.token) {
      response.send({ error: 'Required parameters are missing.' });
      return;
    }

    request.clientManager.setContentToken(request.body.channel, request.body.token, request.body);

    response.send({ status: 'success' });
  }

  /**
   * Publish a message to clients subscribed to a channel.
   */
  publishMessageToContentChannel(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: publishMessageToContentChannel');
    request.clientManager.logger.debug('Body', request.body);

    if (!request.body.channel) {
      request.clientManager.logger.log('An invalid message object was provided.');
      response.send({ error: 'Invalid message' });
      return;
    }

    const result = request.clientManager.publishMessageToContentChannel(
      request.body.channel,
      request.body,
    );
    if (result) {
      response.send({ status: 'success' });
    }
    else {
      response.send({ error: 'Invalid message' });
    }
  }

  /**
   * Add an authToken to a channel.
   * @TODO Unused, needs testing.
   */
  addAuthTokenToChannel(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: addAuthTokenToChannel');

    const authToken = request.params.authToken || '';
    const channel = request.params.channel || '';
    if (!authToken || !channel) {
      request.clientManager.logger.log('Missing authToken or channel');
      response.send({ status: 'failed', error: 'Missing authToken or channel' });
      return;
    }

    if (!/^[a-z0-9_]+$/i.test(channel)) {
      request.clientManager.logger.log('Invalid channel: ' + channel);
      response.send({ status: 'failed', error: 'Invalid channel name.' });
      return;
    }

    const result = request.clientManager.addAuthTokenToChannel(channel, authToken);
    if (result) {
      response.send({ status: 'success' });
    }
    else {
      response.send({ status: 'failed', error: 'Invalid parameters.' });
    }
  }

  /**
   * Remove an authToken from a channel.
   * @TODO Unused, needs testing.
   */
  removeAuthTokenFromChannel(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: removeAuthTokenFromChannel');

    const authToken = request.params.authToken || '';
    const channel = request.params.channel || '';
    if (authToken && channel) {
      if (!/^[a-z0-9_]+$/i.test(channel)) {
        request.clientManager.logger.log('Invalid channel: ' + channel);
        response.send({ status: 'failed', error: 'Invalid channel name.' });
        return;
      }

      const result = request.clientManager.removeAuthTokenFromChannel(channel, authToken);
      if (result) {
        response.send({ status: 'success' });
      }
      else {
        response.send({ status: 'failed', error: 'Invalid parameters.' });
      }
    }
    else {
      request.clientManager.logger.log('Missing authToken or channel');
      response.send({ status: 'failed', error: 'Invalid data' });
    }
  }

  /**
   * Http callback - set the debug flag.
   */
  toggleDebug(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: toggleDebug');

    if (!request.body.debug) {
      response.send({ error: 'Required parameters are missing.' });
      return;
    }

    request.clientManager.settings.debug = request.body.debug;
    response.send({ status: 'success', debug: request.body.debug });
  }

  /**
   * Sends a 404 message.
   */
  send404(request: any, response: any) {
    request.clientManager.logger.debug('Route callback: send404');

    response.status(404).send('Not Found.'); // tslint:disable-line:no-magic-numbers
  }
}
