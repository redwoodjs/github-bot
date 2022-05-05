import { octokit, coreTeamTriage, coreTeamTriageLogins } from 'src/lib/github'
import { addAssigneesToAssignable } from 'src/services/assign'

/**
 * Assign a core team triage member based on who has the least amount of things assigned to them.
 */
type ProjectNextItems = {
  node: {
    items: {
      pageInfo: {
        hasNextPage: boolean
        endCursor: string
      }
      nodes: [ProjectNextItem]
    }
  }
}

type ProjectNextItem = {
  fieldValues: {
    nodes: [
      {
        projectField: {
          name: string
        }
        value: string
      }
    ]
  }
  content: {
    assignees: {
      nodes: [
        {
          login: string
        }
      ]
    }
  }
}

export async function getTriageProjectItems(after?: string) {
  const { node } = await octokit.graphql<ProjectNextItems>(
    `
      query projectNextItems($projectId: ID!, $after: String) {
        node(id: $projectId) {
          ... on ProjectNext {
            items(first: 100, after: $after) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                fieldValues(first: 100) {
                  nodes {
                    projectField {
                      name
                    }
                    value
                  }
                }
                content {
                  ... on Issue {
                    assignees(first: 100) {
                      nodes {
                        login
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
    {
      projectId: process.env.TRIAGE_PROJECT_ID,
      after,
    }
  )

  if (!node.items.pageInfo.hasNextPage) {
    return node.items.nodes
  }

  const nodes = await getTriageProjectItems(node.items.pageInfo.endCursor)

  return [...node.items.nodes, ...nodes]
}

export async function getNextCoreTeamTriageAssigneeId() {
  const triageProjectItems = await getTriageProjectItems()

  const needsTriageItems = triageProjectItems.filter(
    (triageProjectItem: ProjectNextItem) => {
      return triageProjectItem.fieldValues.nodes.some((fieldValue) => {
        if (fieldValue.projectField.name === 'Status') {
          return fieldValue.value === process.env.NEEDS_TRIAGE_STATUS_FIELD_ID
        }
      })
    }
  )

  const coreTeamTriageNoAssigned = coreTeamTriageLogins.map((login) => {
    const noAssigned = needsTriageItems.reduce(
      (noAssigned: number, needsTriageItem: ProjectNextItem) => {
        const isAssigned = needsTriageItem.content.assignees?.nodes?.some(
          (assignee) => assignee.login === login
        )

        if (!isAssigned) {
          return noAssigned
        }

        return noAssigned + 1
      },
      0
    )

    return [login, noAssigned]
  })

  const [nextCoreTeamTriageAssignee] = coreTeamTriageNoAssigned.reduce(
    ([prevLogin, prevAssigned], [nextLogin, nextAssigned]) => {
      if (prevAssigned < nextAssigned) {
        return [prevLogin, prevAssigned]
      }
      return [nextLogin, nextAssigned]
    }
  )

  return coreTeamTriage[nextCoreTeamTriageAssignee].id
}

export async function assignCoreTeamTriage({
  assignableId,
}: {
  assignableId: string
}) {
  const assigneeId = await getNextCoreTeamTriageAssigneeId()

  return addAssigneesToAssignable({
    assignableId,
    assigneeIds: [assigneeId],
  })
}
