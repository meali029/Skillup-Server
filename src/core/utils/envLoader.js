import dotenv from 'dotenv';
import { join } from 'path';
import mongoose from 'mongoose';
import EnvironmentVariable from '../../models/EnvironmentVariable.js';

// Load .env file first (fallback)
const envPath = join(process.cwd(), '.env');
dotenv.config({ path: envPath });

// Cache for environment variables from database
let dbEnvCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load environment variables from database
 * This should be called after database connection is established
 * 
 * Note: This function updates process.env with values from the database.
 * Existing code using process.env will automatically use DB values after this runs.
 * Config files loaded before DB connection (like db.js) will use .env file values,
 * which is the expected behavior for critical startup configuration.
 */
export async function loadEnvFromDatabase() {
  try {
    // Check if mongoose is connected
    if (mongoose.connection.readyState !== 1) {
      console.warn('[EnvLoader] Database not connected, using .env file only');
      return;
    }

    const variables = await EnvironmentVariable.find({});
    dbEnvCache = {};
    
    variables.forEach((envVar) => {
      dbEnvCache[envVar.key] = envVar.value;
      // Override process.env with DB value
      process.env[envVar.key] = envVar.value;
    });

    cacheTimestamp = Date.now();
    console.log(`[EnvLoader] Loaded ${variables.length} environment variables from database`);
  } catch (error) {
    console.error('[EnvLoader] Error loading environment variables from database:', error);
    // Continue with .env file values
  }
}

/**
 * Get environment variable value
 * Priority: Database > .env file > default value
 */
export function getEnv(key, defaultValue = null) {
  // First check database cache
  if (dbEnvCache && dbEnvCache[key]) {
    return dbEnvCache[key];
  }

  // Then check process.env (from .env file)
  if (process.env[key]) {
    return process.env[key];
  }

  // Return default value
  return defaultValue;
}

/**
 * Refresh environment variables from database
 */
export async function refreshEnvFromDatabase() {
  dbEnvCache = null;
  cacheTimestamp = null;
  await loadEnvFromDatabase();
}

/**
 * Check if cache is stale
 */
function isCacheStale() {
  if (!cacheTimestamp) return true;
  return Date.now() - cacheTimestamp > CACHE_TTL;
}

/**
 * Get environment variable with automatic refresh if cache is stale
 */
export async function getEnvWithRefresh(key, defaultValue = null) {
  // Refresh cache if stale
  if (isCacheStale() && mongoose.connection.readyState === 1) {
    await loadEnvFromDatabase();
  }

  return getEnv(key, defaultValue);
}

/**
 * Initialize environment loader
 * Should be called after database connection
 */
export async function initializeEnvLoader() {
  // Wait a bit for database to be fully connected
  if (mongoose.connection.readyState === 1) {
    await loadEnvFromDatabase();
  } else {
    // Wait for connection
    await new Promise((resolve) => {
      if (mongoose.connection.readyState === 1) {
        resolve();
      } else {
        mongoose.connection.once('connected', resolve);
      }
    });
    await loadEnvFromDatabase();
  }
}

export default {
  loadEnvFromDatabase,
  getEnv,
  refreshEnvFromDatabase,
  getEnvWithRefresh,
  initializeEnvLoader,
};

