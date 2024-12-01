export type DatabaseSchema = {
  post: Post;
  sub_state: SubState;
  feed_stats: FeedStats;
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
  hasImage: number;
  /**
   * JSON array of alt text for each image
   */
  altText: string;
  /**
   * URL of the embedded content
   */
  embedUrl: string;
  /**
   * Comma seperated list of tags
   */
  tags: string;
  /**
   * Comma seperated list of links
   */
  links: string;
};

export type FeedStats = {
  /**
   * The feed
   */
  feed: string;
  /**
   * The user
   */
  user: string;
  /**
   * The number of fetches for this feed and user
   */
  fetches: number;
};

export type SubState = {
  service: string;
  cursor: number;
};
