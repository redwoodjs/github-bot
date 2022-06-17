import { setupServer } from 'msw/node'

import {
  projectId,
  getProjectId,
  getProjectIdQuery,
  addToProject,
  addProjectNextItemMutation,
  // ------------------------
  removeFromProject,
  deleteProjectNextItemMutation,
  // ------------------------
  fields,
  fieldNamesToIds,
  currentCycleId,
  checkNeedsDiscussionId,
  checkStaleId,
  priorities,
  priorityNamesToIds,
  statuses,
  statusNamesToIds,
  // ------------------------
  getProjectFieldAndValueNamesToIds,
  getProjectNextFieldsQuery,
  // ------------------------
  updateProjectItemField,
  updateProjectNextItemFieldMutation,
  // ------------------------
  getProjectItemsQuery,
  getProjectItems,
  updateProjectItem,
} from './projects'
import handlers, {
  project,
  item,
  clearItem,
  getPayload,
} from './projects.handlers'

const server = setupServer(...handlers)

beforeAll(() => server.listen())

afterEach(() => {
  clearItem()
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
    await getProjectItems()

    const itemId = await addToProject('content')

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
        Array [
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
        Array [
          "🚨 Urgent",
          "1️⃣ High",
          "2️⃣ Medium",
          "3️⃣ Low",
        ]
      `)
    })
    it('statuses', () => {
      expect(statuses).toMatchInlineSnapshot(`
        Array [
          "Triage",
          "Backlog",
          "Todo",
          "In progress",
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

  let itemId

  beforeEach(async () => {
    itemId = await addToProject('content')
  })

  describe('updates project items fields', () => {
    describe('Cycle', () => {
      beforeEach(async () => {
        await updateProjectItem(itemId, { Cycle: true })
      })

      it('adds the item to the current cycle when `value` is `true`', async () => {
        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgA8VEw": Object {
              "value": "3f06cf41",
            },
            "id": "item",
          }
        `)
      })

      it('removes items from the current cycle when `value` is `false`', async () => {
        await updateProjectItem(itemId, { Cycle: false })

        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgA8VEw": Object {
              "value": "",
            },
            "id": "item",
          }
        `)
      })

      it("throws when `value` isn't a boolean", async () => {
        try {
          await updateProjectItem(itemId, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            Cycle: 'not a boolean',
          })
        } catch (e) {
          expect(e).toMatchInlineSnapshot(`
            [Error: Invalid value for Cycle field
            Expected undefined or boolean, got string]
          `)
        }
      })
    })

    describe('Needs discussion', () => {
      beforeEach(async () => {
        await updateProjectItem(itemId, { 'Needs discussion': true })
      })

      it('checks Needs discussion when `value` is `true`', async () => {
        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgBA-D0": Object {
              "value": "bde7db46",
            },
            "id": "item",
          }
        `)
      })

      it('clears Needs discussion when `value` is `false`', async () => {
        await updateProjectItem(itemId, { 'Needs discussion': false })

        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgBA-D0": Object {
              "value": "",
            },
            "id": "item",
          }
        `)
      })

      it("throws when `value` isn't a boolean", async () => {
        try {
          await updateProjectItemField({
            itemId,
            field: 'Needs discussion',
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            value: 'not undefined or a boolean',
          })
        } catch (e) {
          expect(e).toMatchInlineSnapshot(`
            [Error: Invalid value for Needs discussion field
            Expected undefined or boolean, got string]
          `)
        }
      })
    })

    describe('Priority', () => {
      it('sets Priority to 🚨 Urgent', async () => {
        await updateProjectItem(itemId, { Priority: '🚨 Urgent' })

        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgA8XpE": Object {
              "value": "ce369865",
            },
            "id": "item",
          }
        `)
      })

      it('sets Priority to 1️⃣ High', async () => {
        await updateProjectItem(itemId, { Priority: '1️⃣ High' })

        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgA8XpE": Object {
              "value": "052e57cf",
            },
            "id": "item",
          }
        `)
      })

      it('sets Priority to 2️⃣ Medium', async () => {
        await updateProjectItem(itemId, {
          Priority: '2️⃣ Medium',
        })

        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgA8XpE": Object {
              "value": "8cc6ba48",
            },
            "id": "item",
          }
        `)
      })

      it('sets Priority to 3️⃣ Low', async () => {
        await updateProjectItem(itemId, {
          Priority: '3️⃣ Low',
        })

        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgA8XpE": Object {
              "value": "0a6d1555",
            },
            "id": "item",
          }
        `)
      })

      it("throws if `value` isn't a string", async () => {
        try {
          await updateProjectItem(itemId, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            Priority: true,
          })
        } catch (e) {
          expect(e).toMatchInlineSnapshot(`
            [Error: Invalid value for Priority field
            Expected string, got boolean]
          `)
        }
      })

      it("throws if `value` isn't a valid priority", async () => {
        try {
          await updateProjectItem(itemId, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            Priority: '📼 bazinga',
          })
        } catch (e) {
          expect(e).toMatchInlineSnapshot(`
            [Error: Invalid value for Priority field
            Expected string, got 📼 bazinga]
          `)
        }
      })
    })

    describe('Rollovers', () => {
      beforeEach(async () => {
        await updateProjectItem(itemId, { Rollovers: 4 })
      })

      it('sets Rollovers to `value`', async () => {
        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgBF9oY": Object {
              "value": "4",
            },
            "id": "item",
          }
        `)
      })

      it('clears Rollovers when `value` is 0', async () => {
        await updateProjectItem(itemId, { Rollovers: 0 })

        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgBF9oY": Object {
              "value": "",
            },
            "id": "item",
          }
        `)
      })

      it("throws when `value` isn't a number", async () => {
        try {
          await updateProjectItem(itemId, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            Rollovers: 'not a number',
          })
        } catch (e) {
          expect(e).toMatchInlineSnapshot(`
            [Error: Invalid value for Rollovers field
            Expected undefined or number, got string]
          `)
        }
      })
    })

    describe('Stale', () => {
      beforeEach(async () => {
        await updateProjectItem(itemId, {
          Stale: true,
        })
      })

      it('checks Stale when `value` is `true`', async () => {
        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgBAvTU": Object {
              "value": "290df9e2",
            },
            "id": "item",
          }
        `)
      })

      it('clears Stale when `value` is `false`', async () => {
        await updateProjectItem(itemId, {
          Stale: false,
        })

        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgBAvTU": Object {
              "value": "",
            },
            "id": "item",
          }
        `)
      })

      it("throws when `value` isn't a boolean", async () => {
        try {
          await updateProjectItem(itemId, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            Stale: 'not a boolean',
          })
        } catch (e) {
          expect(e).toMatchInlineSnapshot(`
            [Error: Invalid value for Stale field
            Expected undefined or boolean, got string]
          `)
        }
      })
    })

    describe('Status', () => {
      it('sets Status to Triage', async () => {
        await updateProjectItem(itemId, { Status: 'Triage' })

        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgA8U5Y": Object {
              "value": "30985805",
            },
            "id": "item",
          }
        `)
      })

      it('sets Status to Backlog', async () => {
        await updateProjectItem(itemId, { Status: 'Backlog' })

        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgA8U5Y": Object {
              "value": "2f2ba648",
            },
            "id": "item",
          }
        `)
      })

      it('sets Status to Todo', async () => {
        await updateProjectItem(itemId, { Status: 'Todo' })

        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgA8U5Y": Object {
              "value": "f75ad846",
            },
            "id": "item",
          }
        `)
      })

      it('sets Status to In progress', async () => {
        await updateProjectItem(itemId, { Status: 'In progress' })

        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgA8U5Y": Object {
              "value": "47fc9ee4",
            },
            "id": "item",
          }
        `)
      })

      it('sets Status to Done', async () => {
        await updateProjectItem(itemId, {
          Status: 'Done',
        })

        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgA8U5Y": Object {
              "value": "98236657",
            },
            "id": "item",
          }
        `)
      })

      it('sets Status to Archived', async () => {
        await updateProjectItem(itemId, {
          Status: 'Archived',
        })

        expect(item).toMatchInlineSnapshot(`
          Object {
            "PNF_lADOAq9qTM4ABn0OzgA8U5Y": Object {
              "value": "04688006",
            },
            "id": "item",
          }
        `)
      })

      it("throws if `value` isn't a string", async () => {
        try {
          await updateProjectItem(itemId, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            Status: true,
          })
        } catch (e) {
          expect(e).toMatchInlineSnapshot(`
            [Error: Invalid value for Status field
            Expected string, got boolean]
          `)
        }
      })

      it("throws if `value` isn't a valid status", async () => {
        try {
          await updateProjectItem(itemId, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            Status: 'Needs bazinga',
          })
        } catch (e) {
          expect(e).toMatchInlineSnapshot(`
            [Error: Invalid value for Status field
            Expected string, got Needs bazinga]
          `)
        }
      })
    })
  })

  it('gets and caches project field and value names to ids', async () => {
    expect(fieldNamesToIds.size).toBe(0)
    expect(priorityNamesToIds.size).toBe(0)
    expect(statusNamesToIds.size).toBe(0)

    await updateProjectItem(itemId, { Cycle: true })

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
            "Done" => "98236657",
            "Archived" => "04688006",
          }
        `)
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

  it('get project items', async () => {
    const items = await getProjectItems()

    expect(items.length).toBe(
      getPayload('GetProjectItemsQuery').node.items.nodes.length
    )
  })
})
