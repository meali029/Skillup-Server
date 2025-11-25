# Auth Module Testing Documentation

This directory contains comprehensive tests for the Authentication module of the SkillUp application.

## Test Structure

```
src/__tests__/
├── setup.js                          # Global test setup and configuration
├── helpers/
│   └── testHelpers.js               # Reusable test utilities
├── unit/
│   └── auth/
│       └── auth.service.test.js     # 10 Unit Tests
├── integration/
│   └── auth/
│       └── auth.integration.test.js # 5 Integration Tests
└── business/
    └── auth/
        └── auth.business.test.js    # 3 Business Logic Tests
```

## Test Coverage

### Unit Tests (10 tests)
Tests individual functions and components in isolation:

1. **Register with valid data** - Tests successful user registration
2. **Register with duplicate email** - Tests duplicate email validation
3. **Register incomplete profile** - Tests partial registration
4. **Login with valid credentials** - Tests successful login
5. **Login with invalid password** - Tests password validation
6. **Login with non-existent email** - Tests email validation
7. **Complete profile for freelancer** - Tests freelancer profile completion
8. **Complete profile for client** - Tests client profile completion
9. **Complete profile with invalid role** - Tests role validation
10. **Password reset OTP request** - Tests OTP generation and storage

### Integration Tests (5 tests)
Tests complete API endpoints with real HTTP requests:

1. **Complete registration flow** - Tests full registration endpoint for both freelancer and client
2. **Complete login flow** - Tests login endpoint with various scenarios
3. **Complete profile after partial registration** - Tests profile completion endpoint
4. **Get current user (me endpoint)** - Tests user retrieval endpoint
5. **Password reset flow** - Tests complete password reset workflow

### Business Logic Tests (3 tests)
Tests complex business scenarios and workflows:

1. **User Profile Completion Journey** - Tests complete user onboarding from registration to profile completion, including role switching
2. **Secure Password Reset Workflow** - Tests entire password reset flow with security validations, OTP expiration, and verification
3. **Multi-Role User Management** - Tests role-specific data management, validation, and role switching logic

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage Report
```bash
npm run test:coverage
```

### Run Specific Test Suites
```bash
# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only business logic tests
npm run test:business
```

### Run a Specific Test File
```bash
# Unit tests
npx jest src/__tests__/unit/auth/auth.service.test.js

# Integration tests
npx jest src/__tests__/integration/auth/auth.integration.test.js

# Business tests
npx jest src/__tests__/business/auth/auth.business.test.js
```

## Test Environment

- **Test Framework**: Jest
- **HTTP Testing**: Supertest
- **Database**: MongoDB Memory Server (in-memory database for isolated testing)
- **Test Timeout**: 30 seconds
- **Node Environment**: Uses ES Modules

## Test Features

### Mock Services
- Email service is mocked to prevent sending real emails during tests
- OTP generation is controlled for predictable testing

### Test Helpers
The test suite includes several helper functions:

- `createTestUser()` - Creates a generic test user
- `createTestFreelancer()` - Creates a test freelancer user
- `createTestClient()` - Creates a test client user
- `generateTestToken()` - Generates JWT tokens for authentication
- `getAuthHeaders()` - Creates auth headers with token
- `clearTestData()` - Cleans up test data

### Database Management
- Fresh in-memory MongoDB instance for each test run
- Automatic cleanup after each test
- Isolated test environment

## Test Scenarios Covered

### Authentication
✅ User registration with complete/incomplete profiles  
✅ User login with valid/invalid credentials  
✅ Token generation and validation  
✅ Cookie management  
✅ OAuth user handling  

### Profile Management
✅ Profile completion for freelancers  
✅ Profile completion for clients  
✅ Role switching and data migration  
✅ Profile validation rules  
✅ Role-specific field requirements  

### Password Reset
✅ OTP generation and storage  
✅ OTP verification  
✅ OTP expiration handling  
✅ Password reset with valid OTP  
✅ Security validations  
✅ Email notifications  

### Security
✅ Password hashing  
✅ JWT token security  
✅ OAuth provider restrictions  
✅ OTP security and expiration  
✅ Input validation  

## Coverage Goals

- **Unit Tests**: 80%+ coverage of service functions
- **Integration Tests**: All API endpoints covered
- **Business Logic**: All critical workflows tested

## Best Practices

1. **Isolation**: Each test is independent and doesn't affect others
2. **Cleanup**: Database is cleaned after each test
3. **Mocking**: External services (email) are mocked
4. **Assertions**: Clear and specific assertions
5. **Documentation**: Tests are well-documented with comments

## Continuous Integration

These tests are designed to run in CI/CD pipelines:

```yaml
# Example CI configuration
test:
  script:
    - npm install
    - npm run test:coverage
  coverage: '/All files[^|]*\|[^|]*\s+([\d\.]+)/'
```

## Troubleshooting

### Common Issues

**Issue**: Tests timeout  
**Solution**: Increase timeout in jest.config.js or specific tests

**Issue**: MongoDB connection errors  
**Solution**: Ensure mongodb-memory-server is properly installed

**Issue**: Module import errors  
**Solution**: Verify NODE_OPTIONS=--experimental-vm-modules is set

**Issue**: Tests fail randomly  
**Solution**: Check for async operations without proper await

## Contributing

When adding new tests:

1. Place unit tests in `src/__tests__/unit/`
2. Place integration tests in `src/__tests__/integration/`
3. Place business logic tests in `src/__tests__/business/`
4. Follow existing naming conventions
5. Add descriptive test names and comments
6. Ensure tests are independent and isolated
7. Update this README if adding new test categories

## Test Metrics

Current test metrics:

- **Total Tests**: 18 (10 unit + 5 integration + 3 business)
- **Test Coverage**: Run `npm run test:coverage` to see detailed coverage
- **Average Test Duration**: ~2-5 seconds per test

## Future Enhancements

- [ ] Add performance tests
- [ ] Add E2E tests with real browser
- [ ] Add load/stress tests
- [ ] Add mutation testing
- [ ] Add visual regression tests

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [MongoDB Memory Server](https://github.com/nodkz/mongodb-memory-server)

---

**Last Updated**: November 25, 2025  
**Maintained by**: SkillUp Development Team
