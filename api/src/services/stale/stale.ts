import { octokit } from 'src/lib/github'

/**
 * Get stale issues and PRs.
 */
async function getStaleIssuesAndPRs({ after }: { after?: string }) {
  const {
    search: { pageInfo, nodes },
  } = await octokit.graphql<{
    search: {
      pageInfo: {
        hasNextPage: boolean
        endCursor: string
      }
      nodes: [
        {
          id: string
        }
      ]
    }
  }>(GET_STALE_ISSUES, {
    after,
  })

  if (!pageInfo.hasNextPage) {
    return nodes.filter(filterIssues)
  }

  const nextNodes = await getStaleIssuesAndPRs({ after: pageInfo.endCursor })

  return [...nodes, ...nextNodes]
}

const query = [
  'is:issue',
  'is:open',
  'sort:created-asc',
  '-linked:pr',
  '-label:hopper',
  '-label:next',
  '-label:kind/discussion',
  '-label:topic/structure-&-vscode-ide',
]

query.push(
  `repo:${
    process.env.NODE_ENV === 'development'
      ? process.env.DEV_REPO
      : 'redwoodjs/redwood'
  }`
)

let createdAt: Date | string = new Date()
createdAt.setDate(createdAt.getDate() - 14)
createdAt = createdAt.toISOString().split('T').shift()
query.push(`created:<=${createdAt}`)

let updatedAt: Date | string = new Date()
updatedAt.setDate(updatedAt.getDate() - 7)
updatedAt = updatedAt.toISOString().split('T').shift()
query.push(`updated:<=${updatedAt}`)

const GET_STALE_ISSUES = `
  query GetStaleIssues($after: String) {
    search(
      type: ISSUE
      query: ${query.join(' ')}
      first: 100
      after: $after
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on Issue {
          id
          createdAt
          updatedAt
          number
          title
          url
          author {
            login
          }
          assignees(first: 10) {
            nodes {
              login
            }
          }
        }
      }
    }
  }
`

const filterIssues = (issue) => {
  // if (ISSUES_AND_PRS_TO_SKIP.includes(issue.number)) {
  //   return false
  // }

  if (!issue.projectCards.nodes.length) {
    return true
  }

  const isOnTriageProjectBoard = issue.projectCards.nodes.some(
    (projectCard) => projectCard.project.name === 'Triage'
  )

  if (isOnTriageProjectBoard) {
    return false
  }

  const isIceboxed = issue.projectCards.nodes.some((projectCard) =>
    ['Icebox (post v1-RC priorities)', 'On deck (help-wanted)'].includes(
      projectCard.column?.name
    )
  )

  if (isIceboxed) {
    return false
  }

  return true
}

/**
 * Add a comment.
 */
function addComment({ subjectId, body }) {
  return octokit.graphql(
    `
      mutation AddComment($subjectId: ID!, $body: String!) {
        addComment(input: {
          subjectId: $subjectId,
          body: $body
        }) {
          clientMutationId
        }
      }
    `,
    {
      subjectId,
      body,
    }
  )
}

export async function commentIssueOrPR(issueOrPR) {
  const hasCoreTeamMaintainerAssigned =
    issueOrPR.assignees.nodes.length > 0 &&
    issueOrPR.assignees.nodes.some((assignee) =>
      coreTeamMaintainerLogins.includes(assignee.login)
    )

  const authorIsCoreTeamMaintainer = coreTeamMaintainerLogins.includes(
    issueOrPR.author.login
  )

  let body = authorIsCoreTeamMaintainer
    ? ''
    : `Thanks for your patience @${issueOrPR.author.login}!\n\n`

  if (!hasCoreTeamMaintainerAssigned) {
    if (!authorIsCoreTeamMaintainer) {
      body =
        body +
        `🔔 @jtoar this hasn't seen any activity for at least a week and isn't assigned to anyone. `
    } else {
      body =
        body +
        `🔔 @${issueOrPR.author.login} this hasn't seen any activity for at least a week. `
    }
  } else {
    const coreTeamMembersAssigned = issueOrPR.assignees.nodes.filter(
      (assignee) => coreTeamMaintainerLogins.includes(assignee.login)
    )

    body =
      body +
      `🔔 ${coreTeamMembersAssigned
        .map((assignee) => `@${assignee.login}`)
        .join(', ')} this hasn't seen any activity for at least a week. `
  }

  /**
   * In the future, list bot commands.
   */
  body =
    body +
    [
      `Could you prioritize this and determine a next step and/or where there's resistance?`,
      '',
      `But if this isn't a priority for v1 you can:`,
      `1) put the "hopper" or "next" label on it if it's a post-v1 feature, or`,
      `2) put it in the "Current-Release-Sprint" project's "Icebox" column if it's a post-v1 RC feature.`,
    ].join('\n')

  await addComment({
    subjectId: issueOrPR.id,
    body,
  })
}

export async function markStale() {
  try {
    const issuesAndPRs = await getStaleIssuesAndPRs()

    logger.info({ issuesAndPRs }, 'Stale issues and/or PRs')

    for (const issueOrPR of issuesAndPRs) {
      await commentIssueOrPR(issueOrPR)
    }

    return true
  } catch (error) {
    logger.error({ error })
    return false
  }
}
