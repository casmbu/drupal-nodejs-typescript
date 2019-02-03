declare namespace NodeJS {
  class Global {
    version: string;
  }

  class Process {
    emit(event: 'client-connection', sessionId: string): this;
    emit(event: 'client-to-channel-message', sessionId: string, message: string): this;
    emit(event: 'client-to-client-message', sessionId: string, message: string): this;
    emit(event: 'client-authenticated', sessionId: string, authData: any): this;
    emit(event: 'client-disconnect', sessionId: string): this;
    emit(event: 'message-published', messageBody: any, sentCount: number): this;

    on(event: 'client-connection', listener: Function): this;
    on(event: 'client-authenticated', listener: Function): this;
    on(event: 'client-to-client-message', listener: Function): this;
    on(event: 'client-to-channel-message', listener: Function): this;
    on(event: 'client-disconnect', listener: Function): this;
    on(event: 'message-published', listener: Function): this;
    
    once(event: 'client-connection', listener: Function): this;
    once(event: 'client-authenticated', listener: Function): this;
    once(event: 'client-to-client-message', listener: Function): this;
    once(event: 'client-to-channel-message', listener: Function): this;
    once(event: 'client-disconnect', listener: Function): this;
    once(event: 'message-published', listener: Function): this;
  }
}
