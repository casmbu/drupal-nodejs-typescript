/**
 * Submodule for handling communication with the backend.
 */

import { post } from 'request';
import { stringify } from 'querystring';
import { format } from 'url';
import { Logger } from './utility';

export class Backend {
  settings: any;
  logger: Logger;

  constructor(settings: any) {
    this.settings = settings;

    this.logger = new Logger(this.settings);
  }

  /**
   * Check a service key against the configured service key.
   */
  checkServiceKey(serviceKey: any) {
    // tslint:disable-next-line:triple-equals
    if (this.settings.serviceKey && serviceKey != this.settings.serviceKey) {
      this.logger.log(
        `checkServiceKey: Invalid service key ${serviceKey}, expecting ${this.settings.serviceKey}`,
      );
      return false;
    }
    return true;
  }

  /**
   * Returns the backend url.
   */
  getBackendUrl() {
    return format({
      protocol: this.settings.backend.scheme,
      hostname: this.settings.backend.host,
      port: this.settings.backend.port,
      pathname: this.settings.backend.basePath + this.settings.backend.messagePath,
    });
  }

  /**
   * Returns the header for backend requests.
   */
  getAuthHeader() {
    if (this.settings.backend.httpAuth.length > 0) {
      return 'Basic ' + new Buffer(this.settings.backend.httpAuth).toString('base64');
    }
    return false;
  }

  /**
   * Send a message to the backend.
   */
  sendMessageToBackend(message: any, callback?: Function) {
    const requestBody = stringify({
      messageJson: JSON.stringify(message),
      serviceKey: this.settings.serviceKey,
    });

    const options: any = {
      uri: this.getBackendUrl(),
      body: requestBody,
      headers: {
        'Content-Length': Buffer.byteLength(requestBody),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    if (this.settings.backend.scheme === 'https') {
      options.strictSSL = this.settings.backend.strictSSL;
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
