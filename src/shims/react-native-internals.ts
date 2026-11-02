/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Stand-ins for React Native internals that some libraries import from
 * `react-native/Libraries/...`. Those files exist only in the native runtime;
 * on the web the libraries take their `.web.js` branches and never call these.
 * The dependency pre-bundler still has to resolve the imports, so they point
 * here instead of failing.
 */

export default function codegenNativeComponent(): any {
  return () => null;
}

export const PressabilityDebugView = (): null => null;

export const customDirectEventTypes: Record<string, unknown> = {};

/** ReactNativeViewConfigRegistry */
export function get(): null {
  return null;
}
export function register(): void {}

/** ReactFabric / ReactFabricPublicInstance */
export const ReactFabric = {};
export function getNodeFromPublicInstance(): null {
  return null;
}
export function getNodeFromInternalInstanceHandle(): null {
  return null;
}
export function getPublicInstanceFromInternalInstanceHandle(): null {
  return null;
}
