/*
 * Submodule for utility functions.
 */

export class Logger {
  settings: any;

  /**
   * Constructor for the logger.
   */
  constructor(settings: any) {
    this.settings = settings;
  }


  /**
   * Logs debug messages, if debugging is enabled.
   * @param message
   *   A message to print.
   * @param data
   *   An object to print.
   */
  debug(message: any, data?: any) {
    if (!this.settings.debug) {
      return;
    }

    this.log(message, data);
  }

  /**
   * Logs a message unconditionally.
   */
  log(message: any, data?: any) {
    if (this.settings.showLogs) {
      console.log(this.getTimestamp(), message); // tslint:disable-line:no-console
      if (data) {
        console.log(data); // tslint:disable-line:no-console
      }
    }
  }

  /**
   * Generates the current timestamp.
   */
  getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = this.pad(now.getMonth() + 1);
    const day = this.pad(now.getDate());
    const hour = this.pad(now.getHours());
    const min = this.pad(now.getMinutes());
    const sec = this.pad(now.getSeconds());

    return '[' + year + '/' + month + '/' + day + ' ' + hour + ':' + min + ':' + sec + ']';
  }

  /**
   * Pads a value to two digits.
   */
  pad(value: any) {
    // tslint:disable-next-line:no-magic-numbers
    return value < 10 ? '0' + value : value;
  }
}
