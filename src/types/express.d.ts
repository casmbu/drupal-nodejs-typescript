import { ClientManager } from '../lib/client-manager';

declare global {
  namespace Express {
    export interface Request {
      clientManager?: ClientManager;
    }
  }
}
