/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    // Map compiled paths in dist/index.js to their source .ts files
    // This allows Jest to find the source file that ts-jest will transpile.
    // Crucially, for validation.ts, it ensures that the jest.mock call in the test
    // targets the same module identity that CLIServer eventually imports.
    '^./utils/validation.js$': '<rootDir>/src/utils/validation.ts', // Import from dist/index.js
    '^./utils/directoryValidator.js$': '<rootDir>/src/utils/directoryValidator.ts', // Import from dist/index.js
    '^./utils/toolDescription.js$': '<rootDir>/src/utils/toolDescription.ts', // Import from dist/index.js
    '^./utils/config.js$': '<rootDir>/src/utils/config.ts', // Import from dist/index.js
    '^./utils/configUtils.js$': '<rootDir>/src/utils/configUtils.ts', // Import from dist/index.js
    // Mapping for imports *within* utils files (e.g., config.ts importing validation.ts)
    // Assuming compiled utils are flat in dist/utils, so path from dist/utils/config.js to dist/utils/validation.js would be './validation.js'
    '^./validation.js$': '<rootDir>/src/utils/validation.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
};
