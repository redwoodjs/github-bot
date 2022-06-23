import { setupServer } from 'msw/node'

import { content, setPayload } from 'src/functions/github/github.handlers'
import {
  installationHandler,
  coreTeamMaintainersUsernamesToIds,
} from 'src/lib/github'
import { getProjectFieldAndValueNamesToIds } from 'src/services/projects'
import projectHandlers, {
  project,
  createProjectItem,
} from 'src/services/projects/projects.handlers'

import {
  addAssigneesToAssignableMutation,
  assign,
  getNextTriageTeamMember,
} from './assign'
import handlers from './assign.handlers'

const server = setupServer(installationHandler, ...handlers, ...projectHandlers)

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
    setPayload('issues.opened.contributor')

    await assign(content.id, { to: 'jtoar' })

    expect(content).toHaveProperty('assignees', [
      coreTeamMaintainersUsernamesToIds['jtoar'],
    ])
  })

  it("throws if the assignee isn't in the triage team", async () => {
    try {
      await assign(content.id, {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        to: 'bazinga',
      })
    } catch (e) {
      expect(e).toMatchInlineSnapshot(`[Error: Can't assign to bazinga]`)
    }
  })

  it('chooses the next triage team member if the assignee is Core Team/Triage', async () => {
    await getProjectFieldAndValueNamesToIds()

    project.items = [
      createProjectItem({ assignee: 'jtoar', Status: 'Triage' }),
      createProjectItem({ assignee: 'jtoar', Status: 'Triage' }),
      createProjectItem({ assignee: 'jtoar', Status: 'Triage' }),
      createProjectItem({ assignee: 'jtoar', Status: 'Triage' }),
      createProjectItem({ assignee: 'jtoar', Status: 'Triage' }),
      createProjectItem({ assignee: 'jtoar', Status: 'Triage' }),
      createProjectItem({ assignee: 'simoncrypta', Status: 'Triage' }),
      createProjectItem({ assignee: 'simoncrypta', Status: 'Triage' }),
      createProjectItem({ assignee: 'simoncrypta', Status: 'Triage' }),
      createProjectItem({ assignee: 'callingmedic911', Status: 'Triage' }),
      createProjectItem({ assignee: 'callingmedic911', Status: 'Triage' }),
      createProjectItem({ assignee: 'dac09', Status: 'Triage' }),
    ]

    let username = await getNextTriageTeamMember()
    expect(username).toBe('dthyresson') // 1
    project.items.push(
      createProjectItem({ assignee: username, Status: 'Triage' })
    )

    username = await getNextTriageTeamMember()
    expect(username).toBe('dthyresson') // 2
    project.items.push(
      createProjectItem({ assignee: username, Status: 'Triage' })
    )

    username = await getNextTriageTeamMember()
    expect(username).toBe('dac09') // 2
    project.items.push(
      createProjectItem({ assignee: username, Status: 'Triage' })
    )

    username = await getNextTriageTeamMember()
    expect(username).toBe('dthyresson') // 3
    project.items.push(
      createProjectItem({ assignee: username, Status: 'Triage' })
    )

    username = await getNextTriageTeamMember()
    expect(username).toBe('dac09') // 3
    project.items.push(
      createProjectItem({ assignee: username, Status: 'Triage' })
    )

    username = await getNextTriageTeamMember()
    expect(username).toBe('callingmedic911') // 3
    project.items.push(
      createProjectItem({ assignee: username, Status: 'Triage' })
    )
  })
})
