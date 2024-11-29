import { AppContext } from '../config';
import { QueryParams, OutputSchema as AlgoOutput } from '../lexicon/types/app/bsky/feed/getFeedSkeleton';
import * as bob from './bob';
import * as cats from './cats';
import * as english from './lang/en';
import * as dutch from './lang/nl';

type AlgoHandler = (ctx: AppContext, params: QueryParams) => Promise<AlgoOutput>;

const algos: Record<string, AlgoHandler> = {
  [bob.shortname]: bob.handler,
  [cats.shortname]: cats.handler,
  [english.shortname]: english.handler,
  [dutch.shortname]: dutch.handler,
};

export default algos;
