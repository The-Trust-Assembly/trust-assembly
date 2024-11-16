import { Article } from '../models/Article';
import { TransformedArticle } from '../models/TransformedArticle';

export async function dummyGetTransformation(
  article: Article,
): Promise<TransformedArticle> {
  return Promise.resolve({ transformedText: article.headline.toUpperCase() });
}
