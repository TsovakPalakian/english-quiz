import {messagesWorker} from './learning-messages-worker.mjs';
export {StageAuthBudget} from './learning-messages-worker.mjs';
export const messagesTestWorker=options=>messagesWorker({...options,mode:'test'});
export default messagesTestWorker();
