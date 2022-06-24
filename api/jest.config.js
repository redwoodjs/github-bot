// More info at https://redwoodjs.com/docs/project-configuration-dev-test-build

const config = {
  rootDir: '../',
  preset: '@redwoodjs/testing/config/jest/api',
  setupFilesAfterEnv: ['./api/jest.setup.js'],
}

module.exports = config
