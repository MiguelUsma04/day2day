/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * What `import ... from 'react-native'` resolves to in this project.
 *
 * It is react-native-web plus a few names that native-only code paths inside
 * libraries reference. Those paths never run in the browser, but the bundler
 * must still find the names to link the modules, so they are provided here as
 * harmless placeholders rather than patched in node_modules.
 */

import { View } from 'react-native-web';

export * from 'react-native-web';

/** Android-only; the gesture handler's drawer imports it unconditionally. */
export const DrawerLayoutAndroid: any = View;

/** Native module registry; web libraries check it and fall back when empty. */
export const TurboModuleRegistry: any = {
  get: () => null,
  getEnforcing: () => null,
};
