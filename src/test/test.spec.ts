import { ConfigManager, IDrupalNodejsSettings, IDrupalBackendSettings } from '../lib/config-manager';
import { DrupalServer } from '../lib/server';

import 'ts-mocha';
import 'mocha';
import assert, { equal } from 'assert';
import nock from 'nock';
import { format } from 'url';
import { get, post } from 'request';
import { connect } from 'socket.io-client';

describe('Server app', function () {
  this.timeout(1000); // tslint:disable-line:no-magic-numbers

  let client: any;

  const nodeSettings: IDrupalNodejsSettings = {
    scheme: 'http',
    port: 8080,
    host: 'localhost',
    resource: '/socket.io',
    serviceKey: '__LOL_TESTING__',
    debug: false,
    showLogs: false,
    baseAuthPath: '/nodejs/',
    extensions: [],
    clientsCanWriteToChannels: false,
    clientsCanWriteToClients: false,
    transports: ['websocket', 'polling'],
    jsMinification: true,
    jsEtag: true,
    logLevel: 1,
  };

  const backendSettings: IDrupalBackendSettings = {
    host: 'localhost',
    scheme: 'http',
    port: 8000,
    basePath: '/',
    strictSSL: false,
    messagePath: 'nodejs/message',
    httpAuth: '',
  };

  const testSettings = {
    authToken: 'lol_test_auth_token',
    uid: 666,
    clientId: 'lotestclientid',
  };

  const serverUrl = format({
    protocol: nodeSettings.scheme,
    hostname: nodeSettings.host,
    port: nodeSettings.port,
    pathname: nodeSettings.baseAuthPath,
  });

  const backendHost = format({
    protocol: backendSettings.scheme,
    hostname: backendSettings.host,
    port: backendSettings.port,
  });
  const backendMessagePath = backendSettings.basePath + backendSettings.messagePath;

  const requestOptions: any = {
    url: serverUrl,
    json: true,
    headers: {
      NodejsServiceKey: nodeSettings.serviceKey,
    },
  };

  const bodyMatch = function (body: any) {
    return true;
  };

  const authResult = {
    nodejsValidAuthToken: true,
    clientId: testSettings.clientId,
    channels: [],
    uid: testSettings.uid,
  };

  before(() => {
    const config = new ConfigManager(nodeSettings, backendSettings);
    DrupalServer.start(config);
  });

  after(() => {
    process.exit();
  });

  it('should respond to requests', (done) => {
    get(serverUrl, (error: any, response: any, body: any) => {
      assert(!error);
      done();
    });
  });

  it('should reject missing service key', (done) => {
    const failingRequestOptions = {
      url: serverUrl,
      json: true,
    };

    get(failingRequestOptions, (error: any, response: any, body: any) => {
      equal(body.error, 'Invalid service key.');
      done();
    });
  });

  it('should accept correct service key', (done: any) => {
    requestOptions.url = serverUrl + 'fakepath';

    get(requestOptions, (error: any, response: any, body: any) => {
      equal(response.statusCode, 404); // tslint:disable-line:no-magic-numbers
      done();
    });
  });

  it('should accept content tokens', (done: any) => {
    requestOptions.url = serverUrl + 'content/token';
    requestOptions.body = {
      channel: 'test_channel',
      token: 'mytoken',
    };

    post(requestOptions, (error: any, response: any, body: any) => {
      equal(body.status, 'success');
      done();
    });
  });

  it('should store content tokens', (done: any) => {
    requestOptions.url = serverUrl + 'health/check';

    get(requestOptions, (error: any, response: any, body: any) => {
      assert(body.contentTokens['test_channel']);
      done();
    });
  });

  it('should create channel', (done: any) => {
    requestOptions.url = serverUrl + 'channel/add/test_channel_2';

    post(requestOptions, (error: any, response: any, body: any) => {
      equal(body.status, 'success');
      done();
    });
  });

  it('should persist channel', (done: any) => {
    requestOptions.url = serverUrl + 'channel/check/test_channel_2';

    get(requestOptions, (error: any, response: any, body: any) => {
      equal(body.status, 'success');
      done();
    });
  });

  it('should allow client connections with valid tokens', (done: any) => {
    client = connect(nodeSettings.scheme + '://' + nodeSettings.host + ':' + nodeSettings.port);
    client.on('connect', () => {
      authResult.clientId = client.nsp + '#' + client.id;
      nock(backendHost).post(
        backendMessagePath,
        bodyMatch,
      ).reply(
        200, // tslint:disable-line:no-magic-numbers
        authResult,
      );
      client.emit('authenticate', { authToken: testSettings.authToken }, (response: any) => {
        equal(response.result, 'success');
        done();
      });
    });
  });

  it('should disconnect client connections with invalid tokens', (done: any) => {
    client = connect(nodeSettings.scheme + '://' + nodeSettings.host + ':' + nodeSettings.port);
    client.on('connect', () => {
      authResult.clientId = client.nsp + '#' + client.id;
      authResult.nodejsValidAuthToken = false;
      nock(backendHost).post(
        backendMessagePath,
        bodyMatch,
      ).reply(
        200, // tslint:disable-line:no-magic-numbers
        authResult,
      );
      client.emit('authenticate', { authToken: '__bad_auth_token__' });
    });
    client.on('disconnect', () => {
      done();
    });
  });
});
