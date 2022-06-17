import { setupServer } from 'msw/node'

import {
  createLabelMutation,
  getLabelIdsQuery,
  getLabelNamesToIds,
  labels,
  labelNamesToIds,
  removeLabel,
  removeLabelsFromLabelableMutation,
} from './labels'
import handlers, { labelable } from './labels.handlers'

const server = setupServer(...handlers)

beforeAll(() => server.listen())
afterEach(() => {
  labelNamesToIds.clear()
  server.resetHandlers()
})
afterAll(() => server.close())

it('labels', () => {
  expect(labels).toMatchInlineSnapshot(`
    Array [
      Object {
        "color": "c2e0c6",
        "description": "Use this label to add an issue or PR to the current cycle",
        "name": "action/add-to-cycle",
      },
      Object {
        "color": "c2e0c6",
        "description": "Use this label to add an issue or PR to the discussion queue",
        "name": "action/add-to-discussion-queue",
      },
      Object {
        "color": "c2e0c6",
        "description": "Use this label to add an issue or PR to the backlog",
        "name": "action/add-to-backlog",
      },
    ]
  `)
})

describe('getLabelNamesToIds', () => {
  it('uses the correct query', () => {
    expect(getLabelIdsQuery).toMatchInlineSnapshot(`
      "
        query GetLabelIdsQuery($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            labels(first: 100) {
              nodes {
                name
                id
              }
            }
          }
        }
      "
    `)
  })

  it('gets and caches ids from titles', async () => {
    expect(labelNamesToIds.size).toBe(0)

    const namesToIds = await getLabelNamesToIds()

    expect(namesToIds).toMatchInlineSnapshot(`
      Map {
        "action/add-to-cycle" => "LA_kwDOC2M2f87e3FkP",
        "action/add-to-discussion-queue" => "LA_kwDOC2M2f871Z5FF",
        "action/add-to-backlog" => "LA_kwDOC2M2f87fhNsx",
      }
    `)

    expect(labelNamesToIds.size).toBe(labels.length)
  })
})

describe('removeLabel', () => {
  it('uses the correct query', () => {
    expect(removeLabelsFromLabelableMutation).toMatchInlineSnapshot(`
      "
        mutation RemoveLabelsFromLabelableMutation($labelableId: ID!, $labelIds: [ID!]!) {
          removeLabelsFromLabelable(
            input: { labelableId: $labelableId, labelIds: $labelIds }
          ) {
            clientMutationId
          }
        }
      "
    `)
  })

  it('removes a label from a labelable', async () => {
    await removeLabel({
      labelableId: labelable.id,
      label: 'action/add-to-backlog',
    })

    expect(labelable).toHaveProperty('labels', [
      labelNamesToIds.get('action/add-to-backlog'),
    ])
  })
})

describe('createLabel', () => {
  it('uses the correct query', () => {
    expect(createLabelMutation).toMatchInlineSnapshot(`
      "
        mutation CreateLabelMutation(
          $repositoryId: ID!
          $name: String!
          $color: String!
          $description: String!
        ) {
          createLabel(
            input: {
              repositoryId: $repositoryId
              name: $name
              color: $color
              description: $description
            }
          ) {
            label {
              name
              id
            }
          }
        }
      "
    `)
  })
})
