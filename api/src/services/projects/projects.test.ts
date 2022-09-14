import { copycat } from '@snaplet/copycat'
import { setupServer } from 'msw/node'

import { installationHandler } from 'src/lib/github'

import {
  addToProject,
  addProjectNextItemMutation,
  checkNeedsDiscussionId,
  checkStaleId,
  currentCycleId,
  deleteProjectNextItemMutation,
  fields,
  fieldNamesToIds,
  getProjectFieldAndValueNamesToIds,
  getProjectId,
  getProjectIdQuery,
  getProjectItems,
  getProjectItemsQuery,
  getProjectNextFieldsQuery,
  priorities,
  priorityNamesToIds,
  projectId,
  removeFromProject,
  statuses,
  statusNamesToIds,
  updateProjectItem,
  updateProjectNextItemFieldMutation,
} from './projects'
import type { Statuses } from './projects'
import handlers, {
  project,
  createProjectItem,
  issuesOrPullRequests,
  createIssueOrPullRequest,
} from './projects.handlers'

const server = setupServer(installationHandler, ...handlers)

beforeAll(() => server.listen())
afterEach(() => {
  project.clear()

  fieldNamesToIds.clear()
  priorityNamesToIds.clear()
  statusNamesToIds.clear()

  server.resetHandlers()
})
afterAll(() => server.close())

describe('getProjectId', () => {
  it('uses the correct operation', () => {
    expect(getProjectIdQuery).toMatchInlineSnapshot(`
      "
        query GetProjectIdQuery($login: String!) {
          organization(login: $login) {
            projectsNext(first: 100) {
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

  it("gets and caches the Main project's id", async () => {
    expect(projectId).toBeUndefined()
    await getProjectId()
    expect(projectId).toBe(project.id)
  })
})

describe('addToProject, removeFromProject', () => {
  it('use the correct operations', () => {
    expect(addProjectNextItemMutation).toMatchInlineSnapshot(`
      "
        mutation AddProjectNextItemMutation($projectId: ID!, $contentId: ID!) {
          addProjectNextItem(input: { projectId: $projectId, contentId: $contentId }) {
            projectNextItem {
              id
            }
          }
        }
      "
    `)

    expect(deleteProjectNextItemMutation).toMatchInlineSnapshot(`
      "
        mutation DeleteProjectNextItemMutation($projectId: ID!, $itemId: ID!) {
          deleteProjectNextItem(input: { projectId: $projectId, itemId: $itemId }) {
            deletedItemId
          }
        }
      "
    `)
  })

  it('adds and removes issues and pull requests to the project', async () => {
    issuesOrPullRequests.push(createIssueOrPullRequest('foo'))

    const itemId = await addToProject(copycat.uuid('foo'))

    expect(project.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: itemId })])
    )

    await removeFromProject(itemId)

    expect(project.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: itemId })])
    )
  })
})

describe('getProjectFieldAndValueNamesToIds', () => {
  it('uses the correct operation', () => {
    expect(getProjectNextFieldsQuery).toMatchInlineSnapshot(`
      "
        query GetProjectNextFieldsQuery($projectId: ID!) {
          node(id: $projectId) {
            ... on ProjectNext {
              fields(first: 100) {
                nodes {
                  name
                  id
                  settings
                }
              }
            }
          }
        }
      "
    `)
  })

  describe('uses the correct data', () => {
    it('fields', () => {
      expect(fields).toMatchInlineSnapshot(`
        [
          "Cycle",
          "Needs discussion",
          "Priority",
          "Stale",
          "Rollovers",
          "Status",
        ]
      `)
    })
    it('priorities', () => {
      expect(priorities).toMatchInlineSnapshot(`
        [
          "🚨 Urgent",
          "1️⃣ High",
          "2️⃣ Medium",
          "3️⃣ Low",
        ]
      `)
    })
    it('statuses', () => {
      expect(statuses).toMatchInlineSnapshot(`
        [
          "Triage",
          "Backlog",
          "Todo",
          "In progress",
          "Needs review",
          "Done",
          "Archived",
        ]
      `)
    })
  })

  it('gets and caches project field and value names to ids', async () => {
    expect(currentCycleId).toBeUndefined()
    expect(checkNeedsDiscussionId).toBeUndefined()
    expect(checkStaleId).toBeUndefined()

    expect(fieldNamesToIds.size).toBe(0)
    expect(priorityNamesToIds.size).toBe(0)
    expect(statusNamesToIds.size).toBe(0)

    await getProjectFieldAndValueNamesToIds()

    expect(currentCycleId).toMatchInlineSnapshot(`"3f06cf41"`)
    expect(checkNeedsDiscussionId).toMatchInlineSnapshot(`"bde7db46"`)
    expect(checkStaleId).toMatchInlineSnapshot(`"290df9e2"`)

    expect(fieldNamesToIds).toMatchInlineSnapshot(`
      Map {
        "Cycle" => "PNF_lADOAq9qTM4ABn0OzgA8VEw",
        "Needs discussion" => "PNF_lADOAq9qTM4ABn0OzgBA-D0",
        "Priority" => "PNF_lADOAq9qTM4ABn0OzgA8XpE",
        "Rollovers" => "PNF_lADOAq9qTM4ABn0OzgBF9oY",
        "Stale" => "PNF_lADOAq9qTM4ABn0OzgBAvTU",
        "Status" => "PNF_lADOAq9qTM4ABn0OzgA8U5Y",
      }
    `)
    expect(priorityNamesToIds).toMatchInlineSnapshot(`
      Map {
        "🚨 Urgent" => "ce369865",
        "1️⃣ High" => "052e57cf",
        "2️⃣ Medium" => "8cc6ba48",
        "3️⃣ Low" => "0a6d1555",
      }
    `)
    expect(statusNamesToIds).toMatchInlineSnapshot(`
      Map {
        "Triage" => "30985805",
        "Backlog" => "2f2ba648",
        "Todo" => "f75ad846",
        "In progress" => "47fc9ee4",
        "Needs review" => "a0a0fdba",
        "Done" => "98236657",
        "Archived" => "04688006",
      }
    `)
  })
})

describe('updateProjectItemField', () => {
  it('uses the correct operation', () => {
    expect(updateProjectNextItemFieldMutation).toMatchInlineSnapshot(`
      "
        mutation UpdateProjectNextItemFieldMutation(
          $projectId: ID!
          $itemId: ID!
          $fieldId: ID!
          $value: String!
        ) {
          updateProjectNextItemField(
            input: {
              projectId: $projectId
              itemId: $itemId
              fieldId: $fieldId
              value: $value
            }
          ) {
            projectNextItem {
              id
            }
          }
        }
      "
    `)
  })

  let item

  beforeEach(async () => {
    const issuesOrPullRequest = createIssueOrPullRequest('foo', {
      isInProject: true,
    })
    ;[item] = issuesOrPullRequest.projectNextItems.nodes
    project.items = [item]
  })

  describe('updates project items fields', () => {
    describe('Cycle', () => {
      it('adds and removes items from the current cycle', async () => {
        await updateProjectItem(item.id, { Cycle: true })

        expect(item).toEqual(
          expect.objectContaining({
            fieldValues: {
              nodes: expect.arrayContaining([
                expect.objectContaining({
                  id: fieldNamesToIds.get('Cycle'),
                  value: currentCycleId,
                }),
              ]),
            },
          })
        )

        await updateProjectItem(item.id, { Cycle: false })

        expect(item).toEqual(
          expect.objectContaining({
            fieldValues: {
              nodes: expect.arrayContaining([]),
            },
          })
        )
      })

      it("throws when `value` isn't a boolean", async () => {
        await expect(
          updateProjectItem(item.id, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            Cycle: 'not a boolean',
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(`
                "Invalid value for Cycle field
                Expected undefined or boolean, got string"
          `)
      })
    })

    describe('Needs discussion', () => {
      it('toggles Needs discussion', async () => {
        await updateProjectItem(item.id, { 'Needs discussion': true })

        expect(item).toEqual(
          expect.objectContaining({
            fieldValues: {
              nodes: expect.arrayContaining([
                expect.objectContaining({
                  id: fieldNamesToIds.get('Needs discussion'),
                  value: checkNeedsDiscussionId,
                }),
              ]),
            },
          })
        )

        await updateProjectItem(item.id, { 'Needs discussion': false })

        expect(item).toEqual(
          expect.objectContaining({
            fieldValues: {
              nodes: expect.arrayContaining([]),
            },
          })
        )
      })

      it("throws when `value` isn't a boolean", async () => {
        await expect(
          updateProjectItem(item.id, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            'Needs discussion': 'not undefined or a boolean',
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(`
            "Invalid value for Needs discussion field
            Expected undefined or boolean, got string"
          `)
      })
    })

    describe('Priority', () => {
      it('sets Priority', async () => {
        for (const [Priority, id] of priorityNamesToIds.entries()) {
          await updateProjectItem(item.id, { Priority })

          expect(item).toEqual(
            expect.objectContaining({
              fieldValues: {
                nodes: expect.arrayContaining([
                  expect.objectContaining({
                    id: fieldNamesToIds.get('Priority'),
                    value: id,
                  }),
                ]),
              },
            })
          )
        }
      })

      it("throws if `value` isn't a string or a valid priority", async () => {
        await expect(
          updateProjectItem(item.id, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            Priority: true,
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(`
            "Invalid value for Priority field
            Expected string, got boolean"
          `)

        await expect(
          updateProjectItem(item.id, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            Priority: '📼 bazinga',
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(`
            "Invalid value for Priority field
            Expected string, got 📼 bazinga"
          `)
      })
    })

    describe('Rollovers', () => {
      it('sets and clears Rollovers', async () => {
        const Rollovers = 4

        await updateProjectItem(item.id, { Rollovers })

        expect(item).toEqual(
          expect.objectContaining({
            fieldValues: {
              nodes: expect.arrayContaining([
                expect.objectContaining({
                  id: fieldNamesToIds.get('Rollovers'),
                  value: Rollovers.toString(),
                }),
              ]),
            },
          })
        )

        await updateProjectItem(item.id, { Rollovers: 0 })

        expect(item).toEqual(
          expect.objectContaining({
            fieldValues: {
              nodes: expect.arrayContaining([]),
            },
          })
        )
      })

      it("throws when `value` isn't a number", async () => {
        await expect(
          updateProjectItem(item.id, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            Rollovers: 'not a number',
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(`
            "Invalid value for Rollovers field
            Expected undefined or number, got string"
          `)
      })
    })

    describe('Stale', () => {
      it('checks Stale when `value` is `true`', async () => {
        await updateProjectItem(item.id, { Stale: true })

        expect(item).toEqual(
          expect.objectContaining({
            fieldValues: {
              nodes: expect.arrayContaining([
                expect.objectContaining({
                  id: fieldNamesToIds.get('Stale'),
                  value: checkStaleId,
                }),
              ]),
            },
          })
        )

        await updateProjectItem(item.id, { Stale: false })

        expect(item).toEqual(
          expect.objectContaining({
            fieldValues: {
              nodes: expect.arrayContaining([]),
            },
          })
        )
      })

      it("throws when `value` isn't a boolean", async () => {
        await expect(
          updateProjectItem(item.id, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            Stale: 'not a boolean',
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(`
            "Invalid value for Stale field
            Expected undefined or boolean, got string"
          `)
      })
    })

    describe('Status', () => {
      it('sets Status', async () => {
        for (const [Status, id] of statusNamesToIds.entries()) {
          await updateProjectItem(item.id, { Status })

          expect(item).toEqual(
            expect.objectContaining({
              fieldValues: {
                nodes: expect.arrayContaining([
                  expect.objectContaining({
                    id: fieldNamesToIds.get('Status'),
                    value: id,
                  }),
                ]),
              },
            })
          )
        }
      })

      it("throws if `value` isn't a string", async () => {
        await expect(
          updateProjectItem(item.id, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            Status: true,
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(`
            "Invalid value for Status field
            Expected string, got boolean"
          `)
      })

      it("throws if `value` isn't a valid status", async () => {
        expect(
          updateProjectItem(item.id, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            Status: 'Needs bazinga',
          })
        ).rejects.toThrowErrorMatchingInlineSnapshot(`
            "Invalid value for Status field
            Expected string, got Needs bazinga"
          `)
      })
    })

    it('updates multiple fields at once', async () => {
      await updateProjectItem(item.id, {
        Cycle: true,
        Status: 'In progress',
      })

      expect(item).toEqual(
        expect.objectContaining({
          fieldValues: {
            nodes: expect.arrayContaining([
              expect.objectContaining({
                id: fieldNamesToIds.get('Cycle'),
                value: currentCycleId,
              }),
              expect.objectContaining({
                id: fieldNamesToIds.get('Status'),
                value: statusNamesToIds.get('In progress'),
              }),
            ]),
          },
        })
      )
    })
  })
})

describe('getProjectItems', () => {
  it('uses the correct operation', () => {
    expect(getProjectItemsQuery).toMatchInlineSnapshot(`
      "
        query GetProjectItemsQuery($projectId: ID!, $after: String) {
          node(id: $projectId) {
            ... on ProjectNext {
              items(first: 100, after: $after) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  id
                  title
                  content {
                    ...on UniformResourceLocatable {
                      url
                    }
                    ...on Assignable {
                      assignees(first: 5) {
                        nodes {
                          login
                        }
                      }
                    }
                    ...on Issue {
      								updatedAt

      							}
      							... on PullRequest {
      								updatedAt
      							}
                  }
                  fieldValues(first: 10) {
                    nodes {
                      id
                      projectField {
                        settings
                        name
                      }
                      value
                    }
                  }
                }
              }
            }
          }
        }
      "
    `)
  })

  const statusesToItems: Array<[Statuses, number]> = [
    ['Triage', 10],
    ['Todo', 3],
    ['In progress', 3],
    ['Done', 20],
  ]

  beforeEach(async () => {
    await getProjectFieldAndValueNamesToIds()

    for (const [Status, count] of statusesToItems) {
      for (let i = 0; i < count; i++) {
        project.items.push(
          createProjectItem('foo', { assignee: 'jtoar', Status })
        )
      }
    }
  })

  it('gets project items', async () => {
    const items = await getProjectItems()
    expect(items.length).toBe(project.items.length)
  })

  for (const [Status, count] of statusesToItems) {
    it(`gets ${Status} project items`, async () => {
      const items = await getProjectItems(Status)
      expect(items.length).toBe(count)
    })
  }
})
