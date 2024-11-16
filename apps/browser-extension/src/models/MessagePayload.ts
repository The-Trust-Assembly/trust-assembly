import { TrustAssemblyMessage } from '../utils/messagePassing';
import { Article } from './Article';

export type MessagePayload =
  | {
      action: TrustAssemblyMessage.TOGGLE_MODIFICATION;
    }
  | {
      action: TrustAssemblyMessage.FETCH_TRANSFORMED_HEADLINE;
      article: Article;
    };
