export { getOptions, scan, setOptions, stop } from './runtime';

import { scan } from './runtime';

if (typeof window !== 'undefined') {
  queueMicrotask(() => scan());
}
