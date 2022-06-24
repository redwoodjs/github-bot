import fs from 'node:fs'
import path from 'node:path'

import { copycat } from '@snaplet/copycat'
import { graphql } from 'msw'

import type { CoreTeamMaintainers } from 'src/lib/github'
import { IssueOrPullRequest } from 'src/services/validate'

import {
  checkStaleId,
  currentCycleId,
  fieldNamesToIds,
  projectId,
  statusNamesToIds,
} from './projects'
import type {
  AddProjectNextItemMutationRes,
  GetProjectIdQueryRes,
  GetProjectNextFieldsQueryRes,
  Statuses,
} from './projects'

export function getPayload(operationName: string) {
  return JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'payloads', `${operationName}.json`),
      'utf-8'
    )
  )
}

export const project = {
  title: 'Main',
  id: 'PN_kwDOAq9qTM4ABn0O',
  items: [],
  clear() {
    this.items = []
  },
}

export function createIssueOrPullRequest(
  seed: string,
  {
    hasLinkedPr = false,
    isInProject = true,
    updatedAt = new Date().toISOString(),
    ...projectOptions
  }: {
    hasLinkedPr?: boolean
    isInProject?: boolean
    updatedAt?: string
    Cycle?: '@current' | '@previous'
    Stale?: boolean
    Status?: Statuses
  } = {}
): IssueOrPullRequest & { hasLinkedPr?: boolean } {
  return {
    hasLinkedPr,
    id: copycat.uuid(seed),
    node_id: copycat.uuid(seed),
    title: copycat.sentence(seed),
    url: copycat.sentence(seed),
    updatedAt,
    author: {
      login: copycat.username(seed),
    },
    projectNextItems: {
      nodes: [isInProject && createProjectItem(seed, projectOptions)].filter(
        Boolean
      ),
    },
  }
}

export function createProjectItem(
  seed: string,
  {
    assignee,
    Cycle,
    Stale,
    Status,
  }: {
    assignee?: CoreTeamMaintainers
    Cycle?: '@current' | '@previous'
    Stale?: boolean
    Status?: Statuses
  } = {}
) {
  return {
    id: copycat.uuid(`item_${seed}`),
    content: {
      assignees: {
        nodes: [{ login: assignee }],
      },
    },
    fieldValues: {
      nodes: [
        Cycle && {
          id: fieldNamesToIds.get('Cycle'),
          projectField: {
            name: 'Cycle',
          },
          value: Cycle === '@current' ? currentCycleId : '@previous',
        },
        Stale && {
          id: fieldNamesToIds.get('Stale'),
          projectField: {
            name: 'Stale',
          },
          value: checkStaleId,
        },
        Status && {
          id: fieldNamesToIds.get('Status'),
          projectField: {
            name: 'Status',
          },
          value: statusNamesToIds.get(Status),
        },
      ].filter(Boolean),
    },
    project: {
      id: projectId,
    },
  }
}

export const issuesOrPullRequests: Array<
  ReturnType<typeof createIssueOrPullRequest>
> = []

export function clearIssuesOrPullRequests() {
  issuesOrPullRequests.length = 0
}

const handlers = [
  graphql.query<GetProjectIdQueryRes, any>(
    'GetProjectIdQuery',
    (_req, res, ctx) => {
      return res(ctx.data(getPayload('GetProjectIdQuery')))
    }
  ),
  graphql.mutation<AddProjectNextItemMutationRes, { contentId: string }>(
    'AddProjectNextItemMutation',
    (req, res, ctx) => {
      const { contentId } = req.variables

      const issuesOrPullRequest = issuesOrPullRequests.find(
        (issuesOrPullRequest) => issuesOrPullRequest.node_id === contentId
      )

      const item = createProjectItem('foo', {})

      issuesOrPullRequest.projectNextItems = {
        nodes: [item],
      }

      project.items.push(item)

      return res(
        ctx.data({
          addProjectNextItem: {
            projectNextItem: {
              id: item.id,
            },
          },
        })
      )
    }
  ),
  graphql.mutation<any, { projectId: string; itemId: string }>(
    'DeleteProjectNextItemMutation',
    (req, res, _ctx) => {
      const { itemId } = req.variables

      project.items = project.items.filter((item) => item.id !== itemId)

      return res()
    }
  ),
  graphql.query<GetProjectNextFieldsQueryRes, any>(
    'GetProjectNextFieldsQuery',
    (_req, res, ctx) => {
      return res(ctx.data(getPayload('GetProjectNextFieldsQuery')))
    }
  ),
  graphql.mutation<
    any,
    {
      projectId: string
      itemId: string
      fieldId: string
      value: string
    }
  >('UpdateProjectNextItemFieldMutation', (req, res, _ctx) => {
    const { itemId, fieldId, value } = req.variables

    const item = project.items.find((item) => item.id === itemId)

    const fieldValue = item.fieldValues.nodes.find(
      (node) => node.id === fieldId
    )

    const fieldIdsToNames = [...fieldNamesToIds.keys()].reduce((obj, key) => {
      obj[fieldNamesToIds.get(key)] = key
      return obj
    }, {})

    if (fieldValue) {
      if (value === '') {
        item.fieldValues.nodes = item.fieldValues.nodes.filter(
          (node) => node.id !== fieldId
        )
      }
      fieldValue.value = value
    } else {
      item.fieldValues.nodes.push({
        id: fieldId,
        projectField: {
          name: fieldIdsToNames[fieldId],
        },
        value,
      })
    }

    return res()
  }),
  graphql.query('GetProjectItemsQuery', (_req, res, ctx) => {
    return res(
      ctx.data({
        node: {
          items: {
            pageInfo: {
              hasNextPage: false,
              endCursor: 'end',
            },
            nodes: project.items,
          },
        },
      })
    )
  }),
]

export default handlers
