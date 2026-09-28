// Safari Web Extension service-worker entry point.
// Load the shared browser-extension worker first so its message listeners are
// ready before native auth state is synchronized.
importScripts("background.js", "native-auth-sync.js");
