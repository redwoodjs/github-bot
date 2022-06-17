import { setupServer } from 'msw/node'

import {
  milestoneTitlesToIds,
  getMilestoneIdsQuery,
  updatePullRequestMutation,
  milestonePullRequest,
  getMilestoneTitlesToIds,
  milestones,
} from './milestones'
import handlers, { pullRequest } from './milestones.handlers'

const server = setupServer(...handlers)

beforeAll(() => server.listen())
afterEach(() => {
  milestoneTitlesToIds.clear()
  server.resetHandlers()
})
afterAll(() => server.close())

it('milestones', () => {
  expect(milestones).toMatchInlineSnapshot(`
    Array [
      "next-release",
      "chore",
    ]
  `)
})

describe('getMilestoneTitlesToIds', () => {
  it('uses the correct query', () => {
    expect(getMilestoneIdsQuery).toMatchInlineSnapshot(`
      "
        query GetMilestoneIdsQuery($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            milestones(first: 100) {
              nodes {
                title
                id
              }
            }
          }
        }
      "
    `)
  })

  it('gets and caches ids from titles', async () => {
    expect(milestoneTitlesToIds.size).toBe(0)

    const titlesToIds = await getMilestoneTitlesToIds()

    expect(titlesToIds).toMatchInlineSnapshot(`
      Map {
        "next-release" => "MI_kwDOC2M2f84Aa82f",
        "chore" => "MDk6TWlsZXN0b25lNjc4MjU1MA==",
      }
    `)

    expect(milestoneTitlesToIds.size).toBe(milestones.length)
  })
})

describe('milestonePullRequest', () => {
  it('uses the correct query', () => {
    expect(updatePullRequestMutation).toMatchInlineSnapshot(`
      "
        mutation UpdatePullRequestMutation($pullRequestId: ID!, $milestoneId: ID!) {
          updatePullRequest(
            input: { pullRequestId: $pullRequestId, milestoneId: $milestoneId }
          ) {
            clientMutationId
          }
        }
      "
    `)
  })

  it('adds milestones to a pull request', async () => {
    await milestonePullRequest({
      pullRequestId: pullRequest.id,
      milestone: 'next-release',
    })

    const nextReleaseId = milestoneTitlesToIds.get('next-release')

    expect(pullRequest).toHaveProperty('milestones', [nextReleaseId])

    await milestonePullRequest({
      pullRequestId: pullRequest.id,
      milestone: 'chore',
    })

    const choreId = milestoneTitlesToIds.get('chore')

    expect(pullRequest).toHaveProperty('milestones', [nextReleaseId, choreId])
  })

  it('throws if passed an unsupported milestone', async () => {
    try {
      await milestonePullRequest({
        pullRequestId: pullRequest.id,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        milestone: 'bazinga',
      })
    } catch (e) {
      expect(e).toMatchInlineSnapshot(`[Error: Can't add milestone bazinga]`)
    }
  })
})
