import { octokit } from 'src/lib/github'

import {
  addToProject,
  ADD_TO_PROJECT_MUTATION,
  deleteFromProject,
  DELETE_FROM_PROJECT_MUTATION,
  updateProjectItemField,
  UPDATE_PROJECT_ITEM_FIELD_MUTATION,
} from './projects'

jest.mock('src/lib/github', () => {
  return {
    octokit: {
      graphql: jest.fn(),
    },
  }
})

describe('addToProject', () => {
  const variables = { projectId: 'triage', contentId: 'issue' }

  it('uses the correct query', () => {
    expect(ADD_TO_PROJECT_MUTATION).toMatchInlineSnapshot(`
      "
        mutation AddProjectNextItem($projectId: ID!, $contentId: ID!) {
          addProjectNextItem(input: { projectId: $projectId, contentId: $contentId }) {
            projectNextItem {
              id
            }
          }
        }
      "
    `)
  })

  it('calls octokit.graphql with the correct query and variables', async () => {
    await addToProject(variables)
    expect(octokit.graphql).toHaveBeenCalledWith(
      ADD_TO_PROJECT_MUTATION,
      variables
    )
  })

  it('returns an object with the correct properties', async () => {
    octokit.graphql.mockReturnValueOnce({
      addProjectNextItem: {
        projectNextItem: {
          id: 'triage',
        },
      },
    })
    const res = await addToProject(variables)
    expect(res).toMatchInlineSnapshot(`
      Object {
        "addProjectNextItem": Object {
          "projectNextItem": Object {
            "id": "triage",
          },
        },
      }
    `)
  })
})

describe('deleteFromProject', () => {
  const variables = { projectId: 'triage', itemId: 'issue' }

  it('uses the correct query', () => {
    expect(DELETE_FROM_PROJECT_MUTATION).toMatchInlineSnapshot(`
      "
        mutation DeleteProjectNextItem($projectId: ID!, $itemId: ID!) {
          deleteProjectNextItem(input: { projectId: $projectId, itemId: $itemId }) {
            deletedItemId
          }
        }
      "
    `)
  })

  it('calls octokit.graphql with the correct query and variables', async () => {
    await deleteFromProject(variables)
    expect(octokit.graphql).toHaveBeenCalledWith(
      DELETE_FROM_PROJECT_MUTATION,
      variables
    )
  })

  it('returns an object with the correct properties', async () => {
    octokit.graphql.mockReturnValueOnce({
      deleteProjectNextItem: {
        deletedItemId: 'item',
      },
    })
    const res = await deleteFromProject(variables)
    expect(res).toMatchInlineSnapshot(`
      Object {
        "deleteProjectNextItem": Object {
          "deletedItemId": "item",
        },
      }
    `)
  })
})

describe('updateProjectItemField', () => {
  const variables = {
    projectId: 'triage',
    itemId: 'issue',
    fieldId: 'status',
    value: 'needs discussion',
  }

  it('uses the correct query', () => {
    expect(UPDATE_PROJECT_ITEM_FIELD_MUTATION).toMatchInlineSnapshot(`
      "
        mutation UpdateProjectNextItemField(
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

  it('calls octokit.graphql with the correct query and variables', async () => {
    await updateProjectItemField(variables)
    expect(octokit.graphql).toHaveBeenCalledWith(
      UPDATE_PROJECT_ITEM_FIELD_MUTATION,
      variables
    )
  })
})
