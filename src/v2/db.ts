import { createDb } from '../db';
import { config } from './config.js';

export const db = createDb(config.sqliteLocation);
