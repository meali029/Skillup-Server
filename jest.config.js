export default {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/src/test/setup.unit.js'],
      // discover all tests under src/test except integration/app/e2e
      testMatch: ['<rootDir>/src/test/**/*.test.js'],
      testPathIgnorePatterns: ['<rootDir>/src/test/integration/', '<rootDir>/src/test/app/', '<rootDir>/src/test/e2e/', '<rootDir>/src/test/models/', '<rootDir>/src/test/controllers/', '<rootDir>/src/test/modules/', '<rootDir>/src/test/services/notification.service.test.js', '/node_modules/'],
      collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.config.js',
        '!src/test/**',
        '!src/server.js',
        '!src/index.js',
      ],
      coverageDirectory: 'coverage/unit',
      coverageReporters: ['text', 'lcov', 'html'],
      moduleFileExtensions: ['js', 'json'],
      transform: {
        '^.+\\.js$': ['babel-jest', { presets: [['@babel/preset-env', { targets: { node: 'current' } }]] }],
      },
      transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$))'],
    },

    {
      displayName: 'integration',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/src/test/setup.integration.js'],
      testMatch: ['<rootDir>/src/test/integration/**/*.test.js','<rootDir>/src/test/models/**/*.test.js','<rootDir>/src/test/controllers/**/*.test.js','<rootDir>/src/test/modules/**/*.test.js','<rootDir>/src/test/services/notification.service.test.js'],
      collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.config.js',
        '!src/test/**',
        '!src/server.js',
        '!src/index.js',
      ],
      coverageDirectory: 'coverage/integration',
      coverageReporters: ['text', 'lcov', 'html'],
      moduleFileExtensions: ['js', 'json'],
      testPathIgnorePatterns: ['/node_modules/'],
      transform: {
        '^.+\\.js$': ['babel-jest', { presets: [['@babel/preset-env', { targets: { node: 'current' } }]] }],
      },
      transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$))'],
    },
    {
      displayName: 'e2e',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/src/test/setup.e2e.js'],
      testMatch: ['<rootDir>/src/test/e2e/**/*.test.js'],
      collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.config.js',
        '!src/test/**',
        '!src/server.js',
        '!src/index.js',
      ],
      coverageDirectory: 'coverage/e2e',
      coverageReporters: ['text', 'lcov', 'html'],
      moduleFileExtensions: ['js', 'json'],
      testPathIgnorePatterns: ['/node_modules/'],
      transform: {
        '^.+\\.js$': ['babel-jest', { presets: [['@babel/preset-env', { targets: { node: 'current' } }]] }],
      },
      transformIgnorePatterns: ['node_modules/(?!(.*\\.mjs$))'],
    },
  ],
};

