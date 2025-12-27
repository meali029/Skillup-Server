// Integration tests use the full setup which includes mongodb-memory-server fallback
import './setup.js';
import adminSettingsService from '../modules/admin/admin.settings.service.js';

// Integration tests should use a stable AI mock to avoid flaky provider timeouts
if (typeof jest !== 'undefined') {
  jest.mock('../services/ai/ai.service.js', () => ({
    __esModule: true,
    default: {
      generateProposalDraft: jest.fn(async () => ({
        coverLetter: 'This is an auto-generated draft for testing purposes.',
        bidAmount: 1000,
        deliveryTime: 7,
        confidence: 0.9,
        generatedAt: new Date(),
      })),
      generateCoverLetter: jest.fn(async () => 'This is an auto-generated cover letter for testing.'),
      suggestBidAmount: jest.fn(async () => 1000),
      enhanceJobMatchScore: jest.fn(async (job, freelancer, baseScore = 0) => ({ baseScore, aiScore: baseScore, finalScore: baseScore, confidence: 0 })),
      getHealthStatus: jest.fn(async () => ({ status: 'healthy', enabled: true })),
      getCircuitBreakerStats: jest.fn(() => ({ state: 'CLOSED' })),
      resetCircuitBreaker: jest.fn(),
    },
  }));
}

// Ensure admin settings service is stubbed so AI features are enabled in integration tests
beforeAll(async () => {
  try {
    if (typeof jest !== 'undefined') {
      adminSettingsService.isFeatureEnabled = jest.fn(async (feature) => true);
      adminSettingsService.getAIProvider = jest.fn(async () => 'gemini');
    } else {
      // Fallback - override with simple resolved functions
      adminSettingsService.isFeatureEnabled = async () => true;
      adminSettingsService.getAIProvider = async () => 'gemini';
    }
  } catch (err) {
    console.warn('[setup.integration] Failed to stub adminSettingsService:', err.message);
  }
});
