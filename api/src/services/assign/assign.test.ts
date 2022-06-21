import { setupServer } from 'msw/node'

import { installationHandler } from 'src/lib/github'
import { coreTeamMaintainersUsernamesToIds } from 'src/lib/github'

import { addAssigneesToAssignableMutation, assign } from './assign'
import handlers, { issue, pullRequest } from './assign.handlers'

const server = setupServer(installationHandler, ...handlers)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('assign ', () => {
  it('uses the correct mutation', () => {
    expect(addAssigneesToAssignableMutation).toMatchInlineSnapshot(`
      "
        mutation AddAssigneesToAssignableMutation($assignableId: ID!, $assigneeIds: [ID!]!) {
          addAssigneesToAssignable(
            input: { assignableId: $assignableId, assigneeIds: $assigneeIds }
          ) {
            clientMutationId
          }
        }
      "
    `)
  })

  it('assigns maintainers to issues and pull requests', async () => {
    await assign(issue.id, {
      to: 'jtoar',
    })

    expect(issue).toHaveProperty('assignees', [
      coreTeamMaintainersUsernamesToIds['jtoar'],
    ])

    expect(pullRequest).not.toHaveProperty('assignees', [
      coreTeamMaintainersUsernamesToIds['jtoar'],
    ])
  })

  it("throws if the assignee isn't in the triage team", async () => {
    try {
      await assign(issue.id, {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        to: 'bazinga',
      })
    } catch (e) {
      expect(e).toMatchInlineSnapshot(`[Error: Can't assign to bazinga]`)
    }
  })
})
