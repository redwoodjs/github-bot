import { setupServer } from 'msw/node'

import { setPayload, content } from 'src/functions/github/github.handlers'
import { installationHandler } from 'src/lib/github'

import {
  milestoneTitlesToIds,
  getMilestoneIdsQuery,
  updatePullRequestMutation,
  milestonePullRequest,
  getMilestoneTitlesToIds,
  milestones,
} from './milestones'
import handlers from './milestones.handlers'

const server = setupServer(installationHandler, ...handlers)

beforeAll(() => server.listen())
afterEach(() => {
  milestoneTitlesToIds.clear()
  server.resetHandlers()
})
afterAll(() => server.close())

it('uses the correct milestones', () => {
  expect(milestones).toMatchInlineSnapshot(`
    Array [
      "next-release",
      "chore",
    ]
  `)
})

describe('getMilestoneTitlesToIds', () => {
  it('uses the correct operation', () => {
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

    await getMilestoneTitlesToIds()

    expect(milestoneTitlesToIds).toMatchInlineSnapshot(`
      Map {
        "next-release" => "MI_kwDOC2M2f84Aa82f",
        "chore" => "MDk6TWlsZXN0b25lNjc4MjU1MA==",
      }
    `)
  })
})

describe('milestonePullRequest', () => {
  it('uses the correct operation', () => {
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

  it('adds milestones to a pull request and gets and caches ids from titles', async () => {
    setPayload('pull_request.closed')

    expect(milestoneTitlesToIds.size).toBe(0)

    await milestonePullRequest(content.id, { milestone: 'next-release' })

    expect(milestoneTitlesToIds).toMatchInlineSnapshot(`
      Map {
        "next-release" => "MI_kwDOC2M2f84Aa82f",
        "chore" => "MDk6TWlsZXN0b25lNjc4MjU1MA==",
      }
    `)

    expect(content).toHaveProperty(
      'milestone',
      milestoneTitlesToIds.get('next-release')
    )
  })

  it('throws if passed an unsupported milestone', async () => {
    try {
      await milestonePullRequest(content.id, {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        milestone: 'bazinga',
      })
    } catch (e) {
      expect(e).toMatchInlineSnapshot(`[Error: Can't add milestone bazinga]`)
    }
  })
})
