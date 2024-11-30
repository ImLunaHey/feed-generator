import { AppContext } from '../config';
import { QueryParams, OutputSchema as AlgoOutput } from '../lexicon/types/app/bsky/feed/getFeedSkeleton';
import * as bob from './bob';
import * as cats from './cats';
import * as english from './lang/en';
import * as french from './lang/fr';
import * as dutch from './lang/nl';
import * as luna from './luna';
import * as viewers from './viewers';
import * as noAlt from './no-alt';

type AlgoHandler = (ctx: AppContext, params: QueryParams, requesterDid?: string) => Promise<AlgoOutput>;

const algos: Record<
  string,
  {
    handler: AlgoHandler;
    requiresAuth?: boolean;
  }
> = {
  [bob.shortname]: bob,
  [cats.shortname]: cats,
  [english.shortname]: english,
  [french.shortname]: french,
  [dutch.shortname]: dutch,
  [luna.shortname]: luna,
  [viewers.shortname]: viewers,
  [noAlt.shortname]: noAlt,
};

export default algos;
