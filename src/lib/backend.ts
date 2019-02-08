/**
 * Submodule for handling communication with the backend.
 */

import { post } from 'request';
import { stringify } from 'querystring';
import { format } from 'url';
import { Logger } from './utility';
import { IDrupalNodejsSettings, IDrupalBackendSettings } from './config-manager';

export class Backend {
  private readonly nodeSettings: IDrupalNodejsSettings;
  private readonly backendSettings: IDrupalBackendSettings;
  private readonly logger: Logger;

  constructor(nodeSettings: IDrupalNodejsSettings, backendSettings: IDrupalBackendSettings) {
    this.nodeSettings = nodeSettings;
    this.backendSettings = backendSettings;

    this.logger = new Logger(this.nodeSettings);
  }

  /**
   * Check a service key against the configured service key. This does a secure
   * string comparison that should take a consistent amount of time to do based
   * on the input string's length.
   */
  checkServiceKey(serviceKey: string = '') {
    if (this.nodeSettings.serviceKey) {
      let mismatch = 0;
      for (let i = 0; i < serviceKey.length; i += 1) {
        // tslint:disable-next-line:no-bitwise
        mismatch |= (serviceKey.charCodeAt(i) ^ this.nodeSettings.serviceKey.charCodeAt(i));
      }
      if (serviceKey.length !== this.nodeSettings.serviceKey.length || mismatch) {
        this.logger.log(`checkServiceKey: Invalid service key ${serviceKey}`);
        return false;
      }
    }
    return true;
  }

  /**
   * Returns the backend url.
   */
  getBackendUrl() {
    return format({
      protocol: this.backendSettings.scheme,
      hostname: this.backendSettings.host,
      port: this.backendSettings.port,
      pathname: this.backendSettings.basePath + this.backendSettings.messagePath,
    });
  }

  /**
   * Returns the header for backend requests.
   */
  getAuthHeader() {
    if (this.backendSettings.httpAuth.length > 0) {
      return 'Basic ' + new Buffer(this.backendSettings.httpAuth).toString('base64');
    }
    return false;
  }

  /**
   * Send a message to the backend.
   */
  sendMessageToBackend(message: any, callback?: Function) {
    const requestBody = stringify({
      messageJson: JSON.stringify(message),
      serviceKey: this.nodeSettings.serviceKey,
    });

    const options: any = {
      uri: this.getBackendUrl(),
      body: requestBody,
      headers: {
        'Content-Length': Buffer.byteLength(requestBody),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    if (this.backendSettings.scheme === 'https') {
      options.strictSSL = this.backendSettings.strictSSL;
    }

    const httpAuthHeader = this.getAuthHeader();
    if (httpAuthHeader !== false) {
      options.headers.Authorization = httpAuthHeader;
    }

    this.logger.debug('Sending message to backend');
    this.logger.debug('message', message);
    this.logger.debug('options', options);

    // tslint:disable-next-line:no-empty
    const emptyFunc = () => { };
    post(options, callback || emptyFunc);
  }
}
