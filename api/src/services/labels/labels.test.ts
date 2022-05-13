import { octokit } from 'src/lib/github'

import {
  removeLabels,
  REMOVE_LABELS_MUTATION,
  createLabel,
  CREATE_LABEL_MUTATION,
  actionLabels,
} from './labels'

jest.mock('src/lib/github', () => {
  return {
    octokit: {
      graphql: jest.fn(),
    },
  }
})

describe('removeLabels', () => {
  const variables = {
    labelableId: 'issue',
    labelIds: ['action/add-to-release'],
  }

  it('uses the correct query', () => {
    expect(REMOVE_LABELS_MUTATION).toMatchInlineSnapshot(`
      "
        mutation RemoveLabelsFromLabelable($labelableId: ID!, $labelIds: [ID!]!) {
          removeLabelsFromLabelable(
            input: { labelableId: $labelableId, labelIds: $labelIds }
          ) {
            clientMutationId
          }
        }
      "
    `)
  })

  it('calls octokit.graphql with the correct query and variables', async () => {
    await removeLabels(variables)
    expect(octokit.graphql).toHaveBeenCalledWith(
      REMOVE_LABELS_MUTATION,
      variables
    )
  })
})

describe('createLabel', () => {
  const variables = {
    repositoryId: 'redwood',
    ...actionLabels[0],
  }

  it('uses the correct query', () => {
    expect(CREATE_LABEL_MUTATION).toMatchInlineSnapshot(`
      "
        mutation createLabel(
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

  it('calls octokit.graphql with the correct query and variables', async () => {
    await createLabel(variables)
    expect(octokit.graphql).toHaveBeenCalledWith(CREATE_LABEL_MUTATION, {
      ...variables,
      headers: {
        accept: 'application/vnd.github.bane-preview+json',
      },
    })
  })
})

describe('action labels', () => {
  it("hasn't changed", () => {
    expect(actionLabels).toMatchInlineSnapshot(`
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
})
