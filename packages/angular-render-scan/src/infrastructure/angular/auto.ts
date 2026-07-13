export {
  copyAIPrompt,
  getAIPrompt,
  getOptions,
  scan,
  setOptions,
  stop,
  getSessionData,
  beginInteraction,
  endInteraction,
  getInteractionReport,
  setInteractionBaseline,
  compareWithInteractionBaseline,
  formatInteractionReportMarkdown,
  formatInteractionReportHtml,
} from '../../application/runtime';

import { scan } from '../../application/runtime';

if (typeof window !== 'undefined') {
  queueMicrotask(() => scan());
}
