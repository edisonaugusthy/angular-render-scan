export { getOptions, scan, setOptions, stop } from '../../application/runtime';

import { scan } from '../../application/runtime';

if (typeof window !== 'undefined') {
  queueMicrotask(() => scan());
}
