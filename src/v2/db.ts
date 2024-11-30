import { createDb } from '../db';
import { config } from './config';

export const db = createDb(config.sqliteLocation);
