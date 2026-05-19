// Polyfill loader for idb (IndexedDB wrapper)
// This file ensures the idb library is available for storage-idb.ts
import { openDB } from "idb";
export { openDB };
