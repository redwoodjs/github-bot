import {
  addToReleaseProject,
  deleteFromReleaseProject,
  updateReleaseField,
} from './release'

import { octokit } from 'src/lib/github'

jest.mock('src/lib/github', () => {
  return {
    octokit: {
      graphql: jest.fn(),
    },
  }
})

describe('addToReleaseProject', () => {
  beforeEach(() => {
    octokit.graphql.mockClear()
  })

  const variables = {
    contentId: 'issue',
  }

  it('uses DEV_RELEASE_PROJECT_ID in dev', async () => {
    process.env.NODE_ENV = 'development'
    await addToReleaseProject(variables)
    expect(octokit.graphql.mock.calls[0][1]).toMatchObject({
      projectId: process.env.DEV_RELEASE_PROJECT_ID,
    })
  })

  it('uses RW_RELEASE_PROJECT_ID in prod', async () => {
    process.env.NODE_ENV = 'production'
    await addToReleaseProject(variables)
    expect(octokit.graphql.mock.calls[0][1]).toMatchObject({
      projectId: RW_RELEASE_PROJECT_ID,
    })
  })
})

describe('deleteFromReleaseProject', () => {
  beforeEach(() => {
    octokit.graphql.mockClear()
  })

  const variables = {
    itemId: 'issue',
  }

  it('uses DEV_RELEASE_PROJECT_ID in dev', async () => {
    process.env.NODE_ENV = 'development'
    await deleteFromReleaseProject(variables)
    expect(octokit.graphql.mock.calls[0][1]).toMatchObject({
      projectId: process.env.DEV_RELEASE_PROJECT_ID,
    })
  })

  it('uses RW_RELEASE_PROJECT_ID in prod', async () => {
    process.env.NODE_ENV = 'production'
    await deleteFromReleaseProject(variables)
    expect(octokit.graphql.mock.calls[0][1]).toMatchObject({
      projectId: RW_RELEASE_PROJECT_ID,
    })
  })
})

describe('updateReleaseField', () => {
  beforeEach(() => {
    octokit.graphql.mockClear()
  })

  const variables = {
    itemId: 'issue',
    fieldId: 'status',
    value: 'needs discussion',
  }

  it('uses DEV_RELEASE_PROJECT_ID in dev', async () => {
    process.env.NODE_ENV = 'development'
    await updateReleaseField(variables)
    expect(octokit.graphql.mock.calls[0][1]).toMatchObject({
      projectId: process.env.DEV_RELEASE_PROJECT_ID,
    })
  })

  it('uses RW_RELEASE_PROJECT_ID in prod', async () => {
    process.env.NODE_ENV = 'production'
    await updateReleaseField(variables)
    expect(octokit.graphql.mock.calls[0][1]).toMatchObject({
      projectId: RW_RELEASE_PROJECT_ID,
    })
  })
})
