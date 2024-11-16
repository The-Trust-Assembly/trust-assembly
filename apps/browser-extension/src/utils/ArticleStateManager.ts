import { Article } from '../models/Article';
import { TransformedArticle } from '../models/TransformedArticle';

export type ArticleElement = {
  style: {
    color: string;
    fontStyle: string;
  };
  article: Article;
};

const MODIFIED_STYLE = {
  color: 'blue',
  fontStyle: 'italic',
} as const;

/**
 * Class to manage the state of the article transformation.
 * Currently only supports toggling headline with the default style
 */
export default class ArticleStateManager {
  private toggleState = false;
  private element: HTMLElement | null = null;
  private originalProps: ArticleElement | null = null;
  private modifiedProps: ArticleElement | null = null;

  constructor(
    private fetchModification: (
      article: Article,
    ) => Promise<TransformedArticle>,
  ) {}

  public async setElement(element: HTMLElement): Promise<void> {
    console.log('setting element:', element);

    this.element = element;
    this.originalProps = {
      style: {
        color: element.style.color,
        fontStyle: element.style.fontStyle,
      },
      article: {
        headline: element.textContent || '',
      },
    };

    const modifiedArticle = await this.fetchModification(
      this.originalProps.article,
    );
    this.modifiedProps = {
      style: MODIFIED_STYLE,
      article: {
        headline: modifiedArticle.transformedText,
      },
    };
  }

  public toggleModification(): void {
    if (!this.element || !this.originalProps) {
      console.warn('No element to modify');
      return;
    }
    if (!this.modifiedProps) {
      console.warn('No modified headline to apply');
      return;
    }

    this.toggleState = !this.toggleState;
    const {
      style: { color, fontStyle },
      article: { headline },
    } = this.toggleState ? this.modifiedProps : this.originalProps;

    console.log(`element.style.color: ${color}`);
    console.log(`element.style.fontStyle: ${fontStyle}`);
    console.log(`element.textContent: ${headline}`);

    this.element.style.color = color;
    this.element.style.fontStyle = fontStyle;
    this.element.textContent = headline;
  }
}
