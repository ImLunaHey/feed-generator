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
  uri: string;
  cid: string;
  indexedAt: string;
  text: string;
  langs: Langs;
};

export type SubState = {
  service: string;
  cursor: number;
};
