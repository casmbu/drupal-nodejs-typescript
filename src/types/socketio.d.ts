import { Socket } from 'socket.io';

declare module 'socket.io' {
    interface Socket {
      authToken: string;
      uid: number;
    }
}
