/**
 * Submodule for defining an abstract extension, extensions should implement
 * this.
 */

import { ClientManager } from './client-manager';
import { IDrupalNodejsExtensionRoute, Routes } from './routes';
import { IDrupalNodejsSettings, IDrupalBackendSettings } from './config-manager';

export type DrupalNodejsExtensionCallable = 'alterRoutes' | 'alterSettings' | 'setup';
export interface IDrupalNodejsExtension {
  /**
   * Defines custom routes.
   *
   * Each route should specify the following:
   * @param path: The path that the route will handle.
   * @param type: 'get' or 'post'.
   * @param handler: The callback function to call when this route is requested.
   * @param auth: If true, the service key will be validated and the handler
   *   will only be called if the key is valid. This will also prepend the
   *   baseAuthPath to the path. E.g. the path /example might become
   *   /nodejs/example.
   */
  routes?: IDrupalNodejsExtensionRoute[];

  /**
   * Implements the alterRoutes hook. Use this to override routes defined in
   * routes.ts.
   * @param routes The routes that are defined.
   */
  alterRoutes?(routes: Routes): void;

  /**
   * Implements the alterSettings hook.
   * Use this hook to override settings defined in the config file, and to add
   * settings specific to this extension.
   */
  alterSettings?(settings: IDrupalNodejsSettings & { backend: IDrupalBackendSettings }): void;

  /**
   * Implements the setup hook.
   * Called once after the app starts. Use this hook to add custom behavior to
   * the clientManager, and to initialize your extension.
   */
  setup?(clientManager: ClientManager): void;
}
