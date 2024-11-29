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
};

export type SubState = {
  service: string;
  cursor: number;
};
