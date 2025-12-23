import { asyncHandler, successResponse } from '../../../core/utils/index.js';
import aiService from '../../../services/ai/ai.service.js';
import mongoose from 'mongoose';
import os from 'os';

/**
 * Get comprehensive system health
 */
export const getSystemHealth = asyncHandler(async (req, res) => {
  const health = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    
    // Database health
    database: {
      status: mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy',
      state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState],
      name: mongoose.connection.name || 'N/A',
      host: mongoose.connection.host || 'N/A',
    },
    
    // Memory health
    memory: {
      status: 'healthy',
      usage: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(process.memoryUsage().external / 1024 / 1024)} MB`,
      },
      system: {
        total: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`,
        free: `${Math.round(os.freemem() / 1024 / 1024 / 1024)} GB`,
        usage: `${Math.round((1 - os.freemem() / os.totalmem()) * 100)}%`,
      },
    },
    
    // CPU health
    cpu: {
      status: 'healthy',
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || 'Unknown',
      loadAverage: os.loadavg(),
    },
    
    // Process health
    process: {
      pid: process.pid,
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };
  
  // Overall status
  health.status = health.database.status === 'healthy' ? 'healthy' : 'degraded';
  
  successResponse(res, health, 'System health retrieved successfully');
});

/**
 * Get AI service health and stats
 */
export const getAIHealth = asyncHandler(async (req, res) => {
  const aiHealth = await aiService.getHealthStatus();
  successResponse(res, aiHealth, 'AI health retrieved successfully');
});

/**
 * Get circuit breaker statistics
 */
export const getCircuitBreakerStats = asyncHandler(async (req, res) => {
  const stats = aiService.getCircuitBreakerStats();
  successResponse(res, stats, 'Circuit breaker stats retrieved successfully');
});

/**
 * Reset circuit breaker
 */
export const resetCircuitBreaker = asyncHandler(async (req, res) => {
  aiService.resetCircuitBreaker();
  successResponse(res, { message: 'Circuit breaker reset successfully' }, 'Circuit breaker reset');
});

/**
 * Get comprehensive health dashboard data
 */
export const getHealthDashboard = asyncHandler(async (req, res) => {
  const [systemHealth, aiHealth, circuitBreakerStats] = await Promise.all([
    // System health
    (async () => {
      return {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          status: mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy',
          state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState],
        },
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          systemFree: Math.round(os.freemem() / 1024 / 1024 / 1024),
          systemTotal: Math.round(os.totalmem() / 1024 / 1024 / 1024),
        },
      };
    })(),
    // AI health
    aiService.getHealthStatus(),
    // Circuit breaker
    aiService.getCircuitBreakerStats(),
  ]);

  successResponse(res, {
    system: systemHealth,
    ai: aiHealth,
    circuitBreaker: circuitBreakerStats,
  }, 'Health dashboard data retrieved successfully');
});
