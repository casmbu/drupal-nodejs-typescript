/**
 * Submodule for handling communication with clients.
 */

import { Logger } from './utility';
import { IDrupalNodejsSettings } from './config-manager';
import { Backend } from './backend';

export class ClientManager {
  settings: IDrupalNodejsSettings;
  backend: Backend;
  authenticatedClients: {
    [authToken: string]: {
      uid: number,
      channels: string[],
    },
  } = {};
  preAuthSockets: { [socketId: string]: SocketIO.Socket } = {};
  sockets: { [socketId: string]: SocketIO.Socket } = {};
  onlineUsers: { [uid: number]: number[] } = {};
  tokenChannels: {
    [channel: string]: {
      tokens: any,
      sockets: any,
    },
  } = {};
  presenceTimeoutIds: { [uid: number]: NodeJS.Timeout } = {};
  contentChannelTimeoutIds: { [tokenChannelUid: string]: NodeJS.Timeout } = {};
  channels: {
    [channel: string]: {
      sessionIds: {
        [sessionId: string]: string,
      },
      isClientWritable?: boolean,
    },
  } = {};
  logger: Logger;

  constructor(settings: IDrupalNodejsSettings, backend: Backend) {
    this.settings = settings;
    this.backend = backend;
    this.logger = new Logger(this.settings);
  }

  /**
   * Registers a socket in the internal store.
   * @param socket A socket object.
   */
  addSocket(socket: SocketIO.Socket) {
    this.preAuthSockets[socket.id] = socket;

    process.emit('client-connection', socket.id);

    socket.on('authenticate', (message: any, ackCallback: any) => {
      this.authenticateClient(socket, message, ackCallback);
    });

    socket.on('join-token-channel', (message: any) => {
      this.joinTokenChannel(socket.id, message);
    });

    socket.on('message', (message: any) => {
      this.processMessage(socket.id, message);
    });

    socket.on('disconnect', () => {
      this.cleanupSocket(socket);
    });
  }

  /**
   * Check if the given channel is client-writable.
   */
  channelIsClientWritable(channel: string) {
    if (this.channels.hasOwnProperty(channel)) {
      return this.channels[channel].isClientWritable;
    }
    return false;
  }

  /**
   * Check if the given socket is in the given channel.
   */
  clientIsInChannel(socketId: string, channel: string) {
    if (!this.channels.hasOwnProperty(channel)) {
      return false;
    }
    return this.channels[channel].sessionIds[socketId];
  }

  /**
   * Authenticate a client connection based on the message it sent.
   */
  authenticateClient(clientSocket: SocketIO.Socket, message: any, ackCallback: any) {
    this.logger.debug(`authenticateClient: Authenticating client with key ${message.authToken}`);

    if (this.authenticatedClients[message.authToken]) {
      // tslint:disable-next-line:ter-max-len
      this.logger.debug(`authenticateClient: Reusing existing authentication data for key: ${message.authToken}, client id: ${clientSocket.id}`);
      // setupClientConnection() copies the socket from preAuthSockets to
      // sockets.
      this.setupClientConnection(
        clientSocket.id,
        this.authenticatedClients[message.authToken],
        message.contentTokens,
      );
    }
    else {
      message.messageType = 'authenticate';
      message.clientId = clientSocket.id;
      this.backend.sendMessageToBackend(
        message,
        (error: any, response: any, body: any) => {
          if (!this.authenticateClientCallback(error, response, body)) {
            this.preAuthSockets[message.clientId].disconnect();
            delete this.preAuthSockets[message.clientId];
          }
          else if (ackCallback) {
            ackCallback({ result: 'success' });
          }
        },
      );
    }
  }

  /**
   * Adds the socket to a token channel.
   */
  joinTokenChannel(socketId: string, message: any) {
    if (!this.sockets[socketId]) {
      // This socket is not authenticated yet.
      return;
    }

    const channel = message.channel;
    const token = message.contentToken;

    this.logger.debug('joinTokenChannel: Joining socket to token channel ' + channel + ' using token ' + token);

    if (!channel || !token) {
      return;
    }

    this.tokenChannels[channel] = this.tokenChannels[channel] || { tokens: {}, sockets: {} };

    if (this.tokenChannels[channel].tokens[token]) {
      this.tokenChannels[channel].sockets[socketId] = this.tokenChannels[channel].tokens[token];
      delete this.tokenChannels[channel].tokens[token];

      const notificationMessage = {
        callback: 'clientJoinedTokenChannel',
        data: this.tokenChannels[channel].sockets[socketId],
      };
      this.publishMessageToContentChannel(channel, notificationMessage);
    }
    else {
      this.logger.debug('joinTokenChannel: Invalid token used to join channel.');
    }
  }

  /**
   * Processes an incoming message event on the socket.
   * @param socketId The socket id that received the message.
   * @param message Arbitrary message object.
   */
  processMessage(socketId: string, message: any) {
    // If the message is from an active client, then process it.
    if (this.sockets[socketId] && message.hasOwnProperty('type')) {
      this.logger.debug('processMessage: Received message from client ' + socketId);

      // If this message is destined for a channel, check two things:
      // - that this channel is allowed to get messages directly from clients
      // - that the sending socket is already in this channel (that is, the
      // backend has sent this channel in this user's allowed list).
      // Do not let extensions using this feature accidentally allow sending
      // of messages to any socket on any channel.
      if (message.hasOwnProperty('channel')) {
        if (
          this.channelIsClientWritable(message.channel)
          && this.clientIsInChannel(socketId, message.channel)
        ) {
          process.emit('client-to-channel-message', socketId, message);
        }
        else {
          this.logger.debug('processMessage: Received unauthorized message from client: cannot write to channel ' + socketId);
        }
      }

      // No channel, so this message is destined for one or more clients. Check
      // that this is allowed in the server configuration.
      else if (this.settings.clientsCanWriteToClients) {
        process.emit('client-to-client-message', socketId, message);
      }
      else {
        this.logger.debug('processMessage: Received unauthorized message from client: cannot write to client ' + socketId);
      }
    }
  }

  /**
   * Handle authentication call response.
   */
  authenticateClientCallback(error: any, response: any, body: string) {
    if (error) {
      this.logger.log('authenticateClientCallback: Error with authenticate client request:', error);
      return false;
    }
    // tslint:disable-next-line:triple-equals no-magic-numbers
    if (response.statusCode == 404) {
      this.logger.log('authenticateClientCallback: Backend authentication url not found.');
      this.logger.debug('authenticateClientCallback: Response body', body);
      return false;
    }
    // tslint:disable-next-line:triple-equals no-magic-numbers
    if (response.statusCode == 301) {
      this.logger.log('authenticateClientCallback: Backend authentication url returns a 301 redirect. Please update the url in the configuration file.');
      this.logger.debug('authenticateClientCallback: Response body', body);
      return false;
    }

    let authData: any = false;
    try {
      authData = JSON.parse(body);
    }
    catch (exception) {
      this.logger.log('authenticateClientCallback: Failed to parse authentication message:', exception);
      this.logger.debug('Body', body);
      return false;
    }

    if (authData.error) {
      this.logger.log('authenticateClientCallback: Call failed: ' + authData.error);
      return false;
    }

    if (!authData.nodejsValidAuthToken) {
      this.logger.log('authenticateClientCallback: Invalid login for uid ' + authData.uid);
      return false;
    }

    this.logger.debug('authenticateClientCallback: Valid login for uid ' + authData.uid);
    this.setupClientConnection(authData.clientId, authData, authData.contentTokens);
    this.authenticatedClients[authData.authToken] = authData;
    return true;
  }

  /**
   * Setup a sockets{}.connection with uid, channels etc.
   */
  setupClientConnection(sessionId: string, authData: any, contentTokens: string[]) {
    if (!this.preAuthSockets[sessionId]) {
      this.logger.log("setupClientConnection: Client socket '" + sessionId + "' went away.");
      return;
    }
    this.sockets[sessionId] = this.preAuthSockets[sessionId];
    delete this.preAuthSockets[sessionId];

    this.sockets[sessionId].authToken = authData.authToken;
    this.sockets[sessionId].uid = authData.uid;
    for (const i in authData.channels) {
      if (authData.channels.hasOwnProperty(i)) {
        this.channels[authData.channels[i]] = (
          this.channels[authData.channels[i]]
          || { sessionIds: {} }
        );
        this.channels[authData.channels[i]].sessionIds[sessionId] = sessionId;
      }
    }
    // tslint:disable-next-line:triple-equals
    if (authData.uid != 0) {
      const sendPresenceChange = !this.onlineUsers[authData.uid];
      this.onlineUsers[authData.uid] = authData.presenceUids || [];
      if (sendPresenceChange) {
        // tslint:disable-next-line:no-empty
        this.backend.sendMessageToBackend({ uid: authData.uid, messageType: 'userOnline' }, (response: any) => { });
        this.sendPresenceChangeNotification(authData.uid, 'online');
      }
    }

    let clientToken = '';
    for (const tokenChannel in contentTokens) {
      if (contentTokens.hasOwnProperty(tokenChannel)) {
        if (!this.tokenChannels[tokenChannel]) {
          this.tokenChannels[tokenChannel] = { tokens: {}, sockets: {} };
        }

        const channel = this.tokenChannels[tokenChannel];
        clientToken = contentTokens[tokenChannel];
        if (channel.tokens[clientToken]) {
          channel.sockets[sessionId] = channel.tokens[clientToken];

          // tslint:disable-next-line:ter-max-len
          this.logger.debug(`setupClientConnection: Added token ${clientToken} for channel ${tokenChannel} for socket ${sessionId}`);

          delete this.tokenChannels[tokenChannel].tokens[clientToken];
        }
      }
    }

    process.emit('client-authenticated', sessionId, authData);

    // Notify client that they are now authenticated.
    const message = {
      callback: 'clientAuthenticated',
      data: authData,
    };
    this.publishMessageToClient(sessionId, message);

    // tslint:disable-next-line:ter-max-len
    this.logger.debug(`setupClientConnection: Added channels for uid ${authData.uid}: ${authData.channels.toString()}`);
    this.logger.debug('onlineUsers', this.onlineUsers);
  }

  /**
   * Send a presence notification for uid.
   */
  sendPresenceChangeNotification(uid: number, presenceEvent: any) {
    if (this.onlineUsers[uid]) {
      for (const i in this.onlineUsers[uid]) {
        if (this.onlineUsers[uid].hasOwnProperty(i)) {
          const sessionIds = this.getNodejsSessionIdsFromUid(this.onlineUsers[uid][i]);

          if (sessionIds.length > 0) {
            this.logger.debug('sendPresenceChangeNotification: Sending presence notification for ' + uid + ' to ' + this.onlineUsers[uid][i]);
          }

          for (const j in sessionIds) {
            if (sessionIds.hasOwnProperty(j)) {
              this.sockets[sessionIds[j]].json.send({
                presenceNotification: {
                  uid,
                  event: presenceEvent,
                },
              });
            }
          }
        }
      }
    }

    this.logger.debug('sendPresenceChangeNotification: onlineUsers', this.onlineUsers);
  }

  /**
   * Get the list of Node.js sessionIds for a given uid.
   */
  getNodejsSessionIdsFromUid(uid: number) {
    const sessionIds = [];
    for (const sessionId in this.sockets) {
      // tslint:disable-next-line:triple-equals
      if (this.sockets[sessionId].uid == uid) {
        sessionIds.push(sessionId);
      }
    }

    this.logger.debug('getNodejsSessionIdsFromUid', { uid, sessionIds });

    return sessionIds;
  }

  /**
   * Cleanup after a socket has disconnected.
   */
  cleanupSocket(socket: SocketIO.Socket) {
    process.emit('client-disconnect', socket.id);

    this.logger.debug('cleanupSocket: Cleaning up after socket id ' + socket.id + ', uid ' + socket.uid);

    if (this.preAuthSockets[socket.id]) {
      // This socket was not yet authenticated. No need for further cleanup.
      delete this.preAuthSockets[socket.id];
      return;
    }

    for (const channel in this.channels) {
      if (this.channels.hasOwnProperty(channel)) {
        delete this.channels[channel].sessionIds[socket.id];
      }
    }

    const uid = socket.uid;
    // tslint:disable-next-line:triple-equals
    if (uid != 0) {
      if (this.presenceTimeoutIds[uid]) {
        clearTimeout(this.presenceTimeoutIds[uid]);
      }

      this.presenceTimeoutIds[uid] = setTimeout(() => {
        this.checkOnlineStatus(uid);
      }, 2000); // tslint:disable-line:no-magic-numbers
    }

    for (const tokenChannel in this.tokenChannels) {
      if (this.tokenChannels.hasOwnProperty(tokenChannel)) {
        this.logger.debug('cleanupSocket: checking tokenChannel ' + tokenChannel + ' for socket ' + socket.id);

        if (this.tokenChannels[tokenChannel].sockets[socket.id]) {
          this.logger.debug('cleanupSocket: found socket info for tokenChannel ' + tokenChannel, this.tokenChannels[tokenChannel].sockets[socket.id]);

          if (this.tokenChannels[tokenChannel].sockets[socket.id].notifyOnDisconnect) {
            if (this.contentChannelTimeoutIds[`${tokenChannel}_${uid}`]) {
              clearTimeout(this.contentChannelTimeoutIds[`${tokenChannel}_${uid}`]);
            }

            // tslint:disable-next-line:ter-max-len
            this.contentChannelTimeoutIds[`${tokenChannel}_${uid}`] = setTimeout(() => {
              this.checkTokenChannelStatus(tokenChannel, uid);
            }, 2000); // tslint:disable-line:no-magic-numbers
          }

          delete this.tokenChannels[tokenChannel].sockets[socket.id];
        }
      }
    }

    delete this.sockets[socket.id];
  }

  /**
   * Check for any open sockets for uid.
   */
  checkOnlineStatus(uid: number) {
    if (this.getNodejsSessionIdsFromUid(uid).length === 0) {
      this.logger.debug(`checkOnlineStatus: Sending offline notification for ${uid}`);

      this.setUserOffline(uid);
    }
  }

  /**
   * Sends offline notification to sockets, the backend and cleans up our list.
   */
  setUserOffline(uid: number) {
    this.sendPresenceChangeNotification(uid, 'offline');
    delete this.onlineUsers[uid];
    this.backend.sendMessageToBackend(
      { uid, messageType: 'userOffline' },
      // tslint:disable-next-line:no-empty
      (response: any) => { },
    );
  }

  /**
   * Kicks a user.
   */
  kickUser(uid: number) {
    // Delete the user from the authenticatedClients hash.
    Object.keys(this.authenticatedClients).forEach((authToken) => {
      if (this.authenticatedClients[authToken].uid === uid) {
        delete this.authenticatedClients[authToken];
      }
    });

    // Destroy any socket connections associated with this uid.
    for (const clientId in this.sockets) {
      if (this.sockets[clientId].uid === uid) {
        // @TODO: Need to clean up event listeners on the socket? Or call
        // .cleanupSocket? Note: similar situation in .logoutUser.
        delete this.sockets[clientId];

        this.logger.debug('kickUser: deleted socket', { clientId, uid });

        // Delete any channel entries for this clientId.
        for (const channel in this.channels) {
          if (this.channels.hasOwnProperty(channel)) {
            delete this.channels[channel].sessionIds[clientId];
          }
        }
      }
    }
  }

  /**
   * Add a user to a channel.
   * @return
   *   True on success, false if the client is not found.
   */
  addUserToChannel(channel: string, uid: number) {
    this.channels[channel] = this.channels[channel] || { sessionIds: {} };

    const sessionIds = this.getNodejsSessionIdsFromUid(uid);
    if (sessionIds.length > 0) {
      for (const i in sessionIds) {
        if (sessionIds.hasOwnProperty(i)) {
          this.channels[channel].sessionIds[sessionIds[i]] = sessionIds[i];
        }
      }

      this.logger.debug(
        `addUserToChannel: Added channel ${channel} to sessionIds ${sessionIds.join()}`,
      );
    }
    else {
      this.logger.log(`addUserToChannel: No active sessions for uid: ${uid}`);
      return false;
    }

    // @TODO: Does this need to run even when the client is not connected?
    // (authenticatedClients data will be reused when the connect.)
    for (const authToken in this.authenticatedClients) {
      if (this.authenticatedClients[authToken].uid === uid) {
        if (this.authenticatedClients[authToken].channels.indexOf(channel) === -1) {
          this.authenticatedClients[authToken].channels.push(channel);

          this.logger.debug(`addUserToChannel: Added user ${uid} to channel ${channel}`);
          this.logger.debug('this.authenticatedClients', this.authenticatedClients);
        }
      }
    }

    return true;
  }

  /**
   * Get the list of Node.js sessionIds for a given authToken.
   */
  getNodejsSessionIdsFromAuthToken(authToken: string) {
    const sessionIds = [];
    for (const sessionId in this.sockets) {
      if (this.sockets[sessionId].authToken === authToken) {
        sessionIds.push(sessionId);
      }
    }

    this.logger.debug('getNodejsSessionIdsFromAuthToken', { authToken, sessionIds });

    return sessionIds;
  }

  /**
   * Add an authToken to a channel.
   * @TODO Unused, needs testing.
   */
  addAuthTokenToChannel(channel: string, authToken: string) {
    if (!this.authenticatedClients[authToken]) {
      this.logger.log('addAuthTokenToChannel: Unknown authToken: ' + authToken);
      return false;
    }

    this.channels[channel] = this.channels[channel] || { sessionIds: {} };
    const sessionIds = this.getNodejsSessionIdsFromAuthToken(authToken);
    if (sessionIds.length > 0) {
      for (const i in sessionIds) {
        if (sessionIds.hasOwnProperty(i)) {
          this.channels[channel].sessionIds[sessionIds[i]] = sessionIds[i];
        }
      }

      this.logger.debug(
        `addAuthTokenToChannel: Added sessionIds ${sessionIds.join()} to channel ${channel}`,
      );
    }
    else {
      this.logger.log(`addAuthTokenToChannel: No active sessions for authToken: ${authToken}`);
      return false;
    }

    if (this.authenticatedClients[authToken].channels.indexOf(channel) === -1) {
      this.authenticatedClients[authToken].channels.push(channel);

      this.logger.debug(`addAuthTokenToChannel: Added channel ${channel} to authenticatedClients`);
    }

    return true;
  }

  /**
   * Remove an authToken from a channel.
   * @TODO Unused, needs testing.
   */
  removeAuthTokenFromChannel(channel: string, authToken: string) {
    if (!this.authenticatedClients[authToken]) {
      this.logger.log('removeAuthTokenFromChannel: Invalid authToken: ' + authToken);
      return false;
    }
    if (this.channels[channel]) {
      const sessionIds = this.getNodejsSessionIdsFromAuthToken(authToken);
      for (const i in sessionIds) {
        if (this.channels[channel].sessionIds[sessionIds[i]]) {
          delete this.channels[channel].sessionIds[sessionIds[i]];
        }
      }

      if (this.authenticatedClients[authToken]) {
        const index = this.authenticatedClients[authToken].channels.indexOf(channel);
        if (index !== -1) {
          delete this.authenticatedClients[authToken].channels[index];
        }
      }

      // tslint:disable-next-line:ter-max-len
      this.logger.debug(`removeAuthTokenFromChannel: Successfully removed authToken ${authToken} from channel ${channel}`);

      return true;
    }

    this.logger.log('removeAuthTokenFromChannel: Non-existent channel name ' + channel);
    return false;
  }

  /**
   * Add a client (specified by session ID) to a channel.
   * @TODO: Unused. Shall we keep it?
   */
  addClientToChannel(sessionId: string, channel: string) {
    if (sessionId && channel) {
      if (!this.sockets.hasOwnProperty(sessionId)) {
        this.logger.log(`addClientToChannel: Invalid sessionId: ${sessionId}`);
      }
      else if (!/^[a-z0-9_]+$/i.test(channel)) {
        this.logger.log(`addClientToChannel: Invalid channel: ${channel}`);
      }
      else {
        this.channels[channel] = this.channels[channel] || { sessionIds: {} };
        this.channels[channel].sessionIds[sessionId] = sessionId;

        this.logger.debug(`addClientToChannel: Added channel ${channel} to sessionId ${sessionId}`);

        return true;
      }
    }
    else {
      this.logger.log('addClientToChannel: Missing sessionId or channel name');
    }
    return false;
  }

  /**
   * Remove a client (specified by session ID) from a channel.
   * @TODO: Unused. Shall we keep it?
   */
  removeClientFromChannel(sessionId: string, channel: string) {
    if (sessionId && channel) {
      if (!this.sockets.hasOwnProperty(sessionId)) {
        this.logger.log(`removeClientFromChannel: Invalid sessionId: ${sessionId}`);
      }
      else if (!/^[a-z0-9_]+$/i.test(channel) || !this.channels.hasOwnProperty(channel)) {
        this.logger.log(`removeClientFromChannel: Invalid channel: ${channel}`);
      }
      else if (this.channels[channel].sessionIds[sessionId]) {
        delete this.channels[channel].sessionIds[sessionId];

        // tslint:disable-next-line:ter-max-len
        this.logger.debug(`removeClientFromChannel: Removed sessionId ${sessionId} from channel ${channel}`);

        return true;
      }
    }
    else {
      this.logger.log('removeClientFromChannel: Missing sessionId or channel name');
    }
    return false;
  }

  /**
   * Remove a user from a channel.
   * @return
   *   True on success, false if the client is not found.
   */
  removeUserFromChannel(channel: string, uid: number) {
    if (this.channels[channel]) {
      const sessionIds = this.getNodejsSessionIdsFromUid(uid);
      for (const i in sessionIds) {
        if (this.channels[channel].sessionIds[sessionIds[i]]) {
          delete this.channels[channel].sessionIds[sessionIds[i]];
        }
      }

      for (const authToken in this.authenticatedClients) {
        if (
          this.authenticateClient.hasOwnProperty(authToken)
          && this.authenticatedClients[authToken].uid === uid
        ) {
          const index = this.authenticatedClients[authToken].channels.indexOf(channel);
          if (index !== -1) {
            delete this.authenticatedClients[authToken].channels[index];
          }
        }
      }

      // tslint:disable-next-line:ter-max-len
      this.logger.debug(`removeUserFromChannel: Successfully removed uid ${uid} from channel ${channel}`);

      return true;
    }

    this.logger.log(`removeUserFromChannel: Non-existent channel name ${channel}`);
    return false;
  }

  /**
   * Add a channel.
   */
  addChannel(channel: string) {
    if (this.channels[channel]) {
      this.logger.log(`addChannel: Channel name '${channel}' already exists.`);
      return false;
    }

    this.channels[channel] = { sessionIds: {} };

    this.logger.debug(`addChannel: Successfully added channel ${channel}`);

    return true;
  }

  /**
   * Returns data for health check purposes.
   */
  getStats() {
    return {
      authenticatedClients: Object.keys(this.authenticatedClients).length,
      sockets: Object.keys(this.sockets).length,
      onlineUsers: Object.keys(this.onlineUsers).length,
      tokenChannels: Object.keys(this.tokenChannels).length,
      contentTokens: this.tokenChannels,
    };
  }

  /**
   * Checks whether a channel exists.
   * @param channel
   *   Channel name.
   * @return
   *   True on success false on error.
   */
  checkChannel(channel: string) {
    if (this.channels[channel]) {
      this.logger.log(`checkChannel: Channel name '${channel}' is active on the server.`);
      return true;
    }

    this.logger.log(`checkChannel: Channel name '${channel}' is not active on the server.`);
    return false;
  }

  /**
   * Remove a channel.
   * @param channel
   *   Channel name.
   * @return
   *   True on success false on error.
   */
  removeChannel(channel: string) {
    if (this.channels[channel]) {
      delete this.channels[channel];

      this.logger.debug(`removeChannel: Successfully removed channel ${channel}`);

      return true;
    }

    this.logger.log(`removeChannel: Non-existent channel name ${channel}`);
    return false;
  }

  /**
   * Set the list of users a uid can see presence info about.
   */
  setUserPresenceList(uid: number, uidList: number[]) {
    for (const i in uidList) {
      if (!/^\d+$/.test(uidList[i].toString())) {
        this.logger.log(`setUserPresenceList: Invalid uid: ${uid}`);
        return false;
      }
    }
    this.onlineUsers[uid] = uidList;

    return true;
  }

  /**
   * Get the list of backend uids and authTokens connected to a content token channel.
   */
  getContentTokenChannelUsers(channel: string) {
    const users = { uids: new Array(), authTokens: new Array() };

    if (!channel || !this.tokenChannels[channel]) {
      return users;
    }

    for (const sessionId in this.tokenChannels[channel].sockets) {
      if (this.sockets[sessionId].uid) {
        users.uids.push(this.sockets[sessionId].uid);
      }
      else {
        users.authTokens.push(this.sockets[sessionId].authToken);
      }
    }
    return users;
  }

  /**
   * Set a content token.
   */
  setContentToken(channel: string, token: string, value: string) {
    this.tokenChannels[channel] = this.tokenChannels[channel] || { tokens: {}, sockets: {} };
    this.tokenChannels[channel].tokens[token] = value;
  }

  /**
   * Publish a message to clients subscribed to a channel.
   * @return
   *   True on success; false on error.
   */
  publishMessageToContentChannel(channel: string, message: any) {
    if (!this.tokenChannels.hasOwnProperty(channel)) {
      this.logger.log('publishMessageToContentChannel: The channel ' + channel + " doesn't exist.");
      return false;
    }

    for (const socketId in this.tokenChannels[channel].sockets) {
      if (this.tokenChannels[channel].sockets.hasOwnProperty(socketId)) {
        this.publishMessageToClient(socketId, message);
      }
    }
    return true;
  }

  /**
   * Logout the given user from the server.
   */
  logoutUser(authToken: string) {
    // Delete the user from the authenticatedClients hash.
    delete this.authenticatedClients[authToken];

    // Destroy any socket connections associated with this authToken.
    for (const clientId in this.sockets) {
      if (this.sockets[clientId].authToken === authToken) {
        // @TODO: Ok to call cleanupSocket here? That method assumes the client
        // has disconnected. Also, need to clean up event listeners on the
        // socket.
        this.cleanupSocket(this.sockets[clientId]);
      }
    }
  }

  /**
   * Check for any open sockets associated with the channel and socket pair.
   */
  checkTokenChannelStatus(tokenChannel: string, uid: number) {
    // If the tokenChannel no longer exists, just bail.
    if (!this.tokenChannels[tokenChannel]) {
      this.logger.log(`checkTokenChannelStatus: no tokenChannel ${tokenChannel}`);
      return;
    }

    // If we find a socket for this user in the given tokenChannel, we can just
    // return, as there's nothing we need to do.
    const sessionIds = this.getNodejsSessionIdsFromUid(uid);
    for (let i = 0; i < sessionIds.length; i++) {
      if (this.tokenChannels[tokenChannel].sockets[sessionIds[i]]) {
        this.logger.log(`checkTokenChannelStatus: found socket for tokenChannel ${tokenChannel}`);
        return;
      }
    }

    // We didn't find a socket for this uid, and we have other sockets in this,
    // channel, so send disconnect notification message.
    const message = {
      channel: tokenChannel,
      contentChannelNotification: true,
      data: {
        uid,
        type: 'disconnect',
      },
    };
    for (const socketId in this.tokenChannels[tokenChannel].sockets) {
      if (this.tokenChannels[tokenChannel].sockets.hasOwnProperty(socketId)) {
        this.publishMessageToClient(socketId, message);
      }
    }
  }

  /**
   * Publish a message to a specific client.
   */
  publishMessageToClient(sessionId: string, message: any) {
    if (this.sockets[sessionId]) {
      this.sockets[sessionId].json.send(message);

      this.logger.debug(`publishMessageToClient: Sent message to client ${sessionId}`);
      return true;
    }

    this.logger.log(`publishMessageToClient: Failed to find client ${sessionId}`);
    return false;
  }

  /**
   * Publish a message to clients subscribed to a channel.
   */
  publishMessageToChannel(message: any) {
    if (!message.hasOwnProperty('channel')) {
      this.logger.log('publishMessageToChannel: An invalid message object was provided.');
      return 0;
    }
    if (!this.channels.hasOwnProperty(message.channel)) {
      this.logger.log(`publishMessageToChannel: The channel ${message.channel} doesn't exist.`);
      return 0;
    }

    let clientCount = 0;
    for (const sessionId in this.channels[message.channel].sessionIds) {
      if (this.publishMessageToClient(sessionId, message)) {
        clientCount++;
      }
    }

    // tslint:disable-next-line:ter-max-len
    this.logger.debug(`publishMessageToChannel: Sent message to ${clientCount} clients in channel ${message.channel}`);

    return clientCount;
  }

  /**
   * Broadcasts a message to all sockets.
   */
  broadcastMessage(message: any) {
    this.logger.debug('broadcastMessage', message);

    for (const socketId in this.sockets) {
      if (this.sockets.hasOwnProperty(socketId)) {
        this.publishMessageToClient(socketId, message);
      }
    }
  }

  /**
   * Returns the number of open sockets.
   */
  getSocketCount() {
    return Object.keys(this.sockets).length;
  }
}
