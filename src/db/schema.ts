export type DatabaseSchema = {
  post: Post;
  sub_state: SubState;
};

/**
 * Comma seperated list of languages
 *
 * e.g. "en,es,fr"
 */
type Langs = string;

export type Post = {
  /**
   * CID of the author
   */
  author: string;
  /**
   * URI of the post
   */
  uri: string;
  /**
   * CID of the post
   */
  cid: string;
  /**
   * When the post was indexed by the app view
   */
  indexedAt: string;
  /**
   * The text of the post
   */
  text: string;
  /**
   * Comma seperated list of languages
   */
  langs: Langs;
  /**
   * Number of likes
   */
  likes: number;
  /**
   * Number of replies
   */
  replies: number;
  /**
   * Comma seperated list of labels
   */
  labels: string;
  /**
   * Whether the post has an image
   */
  hasImage: boolean;
  /**
   * Whether the post has an alt text
   */
  hasAlt: boolean;
};

export type SubState = {
  service: string;
  cursor: number;
};
