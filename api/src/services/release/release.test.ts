import {
  RW_RELEASE_PROJECT_ID,
  RW_RELEASE_STATUS_FIELD_ID,
  RW_IN_PROGRESS_STATUS_FIELD_ID,
  RW_NEW_PRS_STATUS_FIELD_ID,
  RW_ADD_TO_RELEASE_LABEL_ID,
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

describe('constants', () => {
  it("haven't changed", () => {
    expect(RW_RELEASE_PROJECT_ID).toMatchInlineSnapshot(`"PN_kwDOAq9qTM4AARb-"`)
    expect(RW_RELEASE_STATUS_FIELD_ID).toMatchInlineSnapshot(
      `"MDE2OlByb2plY3ROZXh0RmllbGQ1NDExMjE="`
    )
    expect(RW_IN_PROGRESS_STATUS_FIELD_ID).toMatchInlineSnapshot(`"98236657"`)
    expect(RW_NEW_PRS_STATUS_FIELD_ID).toMatchInlineSnapshot(`"62e9c111"`)
    expect(RW_ADD_TO_RELEASE_LABEL_ID).toMatchInlineSnapshot(
      `"LA_kwDOC2M2f87erIv2"`
    )
  })
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
