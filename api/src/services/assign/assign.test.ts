import { setupServer } from 'msw/node'

import { content, setPayload } from 'src/functions/github/github.handlers'
import {
  coreTeamMaintainersUsernamesToIds,
  coreTeamTriage,
  installationHandler,
} from 'src/lib/github'
import { getProjectFieldAndValueNamesToIds } from 'src/services/projects'
import projectHandlers, {
  createProjectItem,
  project,
} from 'src/services/projects/projects.handlers'

import {
  addAssigneesToAssignableMutation,
  assign,
  getNextTriageTeamMember,
} from './assign'
import handlers from './assign.handlers'

const server = setupServer(installationHandler, ...handlers, ...projectHandlers)

beforeAll(async () => {
  server.listen()
  await getProjectFieldAndValueNamesToIds()
})
afterEach(() => {
  server.resetHandlers()
  project.items = []
})
afterAll(() => server.close())

describe('assign ', () => {
  it('uses the correct operation', () => {
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
    await expect(
      assign(content.id, {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        to: 'bazinga',
      })
    ).rejects.toThrowErrorMatchingInlineSnapshot(`"Can't assign to bazinga"`)
  })

  it("chooses jtoar if everyone's tied", async () => {
    project.items = coreTeamTriage.map((assignee) =>
      createProjectItem('foo', {
        assignee,
        Status: 'Triage',
      })
    )

    const username = await getNextTriageTeamMember()

    expect(username).toBe('jtoar') // 1
  })

  it("chooses jtoar if there's a tie", async () => {
    project.items = coreTeamTriage.map((assignee) =>
      createProjectItem('foo', {
        assignee,
        Status: 'Triage',
      })
    )

    project.items = [
      ...project.items,
      createProjectItem('foo', {
        assignee: 'callingmedic911',
        Status: 'Triage',
      }),
    ]

    const username = await getNextTriageTeamMember()

    expect(username).toBe('jtoar')
  })

  it('chooses the next triage team member if the assignee is Core Team/Triage', async () => {
    project.items = [
      createProjectItem('foo', { assignee: 'jtoar', Status: 'Triage' }),
      createProjectItem('foo', { assignee: 'jtoar', Status: 'Triage' }),
      createProjectItem('foo', { assignee: 'jtoar', Status: 'Triage' }),
      createProjectItem('foo', { assignee: 'jtoar', Status: 'Triage' }),
      createProjectItem('foo', { assignee: 'jtoar', Status: 'Triage' }),
      createProjectItem('foo', { assignee: 'jtoar', Status: 'Triage' }),
      createProjectItem('foo', { assignee: 'simoncrypta', Status: 'Triage' }),
      createProjectItem('foo', { assignee: 'simoncrypta', Status: 'Triage' }),
      createProjectItem('foo', { assignee: 'simoncrypta', Status: 'Triage' }),
      createProjectItem('foo', {
        assignee: 'callingmedic911',
        Status: 'Triage',
      }),
      createProjectItem('foo', {
        assignee: 'callingmedic911',
        Status: 'Triage',
      }),
      createProjectItem('foo', { assignee: 'dac09', Status: 'Triage' }),
    ]

    let username = await getNextTriageTeamMember()
    console.log(username)
    expect(['dthyresson', 'Tobbe']).toContain(username)
    project.items.push(
      createProjectItem('foo', { assignee: username, Status: 'Triage' })
    )

    username = await getNextTriageTeamMember()
    console.log(username)
    expect(['dthyresson', 'Tobbe']).toContain(username)
    project.items.push(
      createProjectItem('foo', { assignee: username, Status: 'Triage' })
    )

    username = await getNextTriageTeamMember()
    console.log(username)
    expect(['dac09', 'dthyresson', 'Tobbe']).toContain(username)
  })
})
