import { AppContext, GeneratorContext } from '../config';
import { QueryParams, OutputSchema as AlgoOutput } from '../lexicon/types/app/bsky/feed/getFeedSkeleton';
import * as bob from './bob';
import * as cats from './cats';
import * as english from './lang/en';
import * as french from './lang/fr';
import * as dutch from './lang/nl';
import * as other from './lang/other';
import * as portuguese from './lang/pt';
import * as luna from './luna';
import * as viewers from './viewers';
import * as noAlt from './no-alt';
import * as youtubeVideos from './youtube-videos';
import * as newsUsa from './news/usa';
import * as swifities from './swifties';
import * as buildInPublic from './build-in-public';
import * as pinned from './pinned';

type AlgoHandler = (ctx: AppContext, params: QueryParams, requesterDid?: string) => Promise<AlgoOutput>;

const algos: Record<
  string,
  {
    handler: AlgoHandler;
    requiresAuth?: boolean;
    generator?: (ctx: GeneratorContext) => Promise<void>;
  }
> = {
  [bob.shortname]: bob,
  [cats.shortname]: cats,
  [english.shortname]: english,
  [french.shortname]: french,
  [other.shortname]: other,
  [dutch.shortname]: dutch,
  [portuguese.shortname]: portuguese,
  [luna.shortname]: luna,
  [viewers.shortname]: viewers,
  [noAlt.shortname]: noAlt,
  [youtubeVideos.shortname]: youtubeVideos,
  [newsUsa.shortname]: newsUsa,
  [swifities.shortname]: swifities,
  [buildInPublic.shortname]: buildInPublic,
  [pinned.shortname]: pinned,
};

export default algos;
