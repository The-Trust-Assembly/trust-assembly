export type ArticleElement = {
  style: {
    color: string;
    fontStyle: string;
  };
  headline: string;
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

  public async setElement(element: HTMLElement): Promise<void> {
    console.log('setting element:', element);

    this.element = element;
    this.originalProps = {
      style: {
        color: element.style.color,
        fontStyle: element.style.fontStyle,
      },
      headline: element.textContent || '',
    };
  }

  public setModifiedHeadline(modifiedHeadline?: string): void {
    this.setModificationState({ modifiedHeadline, state: true });
  }

  public toggleModification(modifiedHeadline?: string): void {
    this.setModificationState({ modifiedHeadline, state: !this.toggleState });
  }

  private setModificationState({
    modifiedHeadline,
    state,
  }: {
    modifiedHeadline?: string;
    state: boolean;
  }): void {
    if (!this.element || !this.originalProps) {
      console.warn('No element to modify');
      return;
    }

    this.modifiedProps = {
      style: MODIFIED_STYLE,
      headline: modifiedHeadline || this.originalProps.headline,
    };

    this.toggleState = state;
    const {
      style: { color, fontStyle },
      headline,
    } = this.toggleState ? this.modifiedProps : this.originalProps;

    console.log(`element.style.color: ${color}`);
    console.log(`element.style.fontStyle: ${fontStyle}`);
    console.log(`element.textContent: ${headline}`);

    this.element.style.color = color;
    this.element.style.fontStyle = fontStyle;
    this.element.textContent = headline;
  }
}
