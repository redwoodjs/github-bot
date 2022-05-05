import { execSync } from 'child_process'

import { octokit } from 'api/src/lib/github'
import prompts from 'prompts'

export default async () => {
  const getOpenIssueAndPullRequestURLs = await getOpenIssueAndPullRequestURLs()
  // Temporary.
  await birdByBird(Array.from(new Set(getOpenIssueAndPullRequestURLs)))
}

async function birdByBird(birds, { start = 0 } = {}) {
  let i = start // 127

  // eslint-disable-next-line no-constant-condition
  while (true) {
    execSync(`open ${birds[i]}`)

    const { res } = await prompts(
      {
        name: 'res',
        type: 'select',
        message: `${i}/${birds.length} what would you like to do next?`,
        choices: [{ value: 'next' }, { value: 'previous' }, { value: 'quit' }],
        initial: 0,
      },
      {
        onCancel: true,
      }
    )

    if (res === 'quit') {
      break
    }

    if (res === 'next') {
      if (!birds[i + 1]) {
        console.log("You're at the end")
        continue
      }

      i++
      continue
    }

    if (res === 'previous') {
      if (!birds[i - 1]) {
        console.log("You're at the beginning")
        continue
      }

      i--
      continue
    }
  }
}

async function getOpenIssueAndPullRequestURLs({
  issuesAfter,
  pullRequestsAfter,
}: {
  issuesAfter?: string
  pullRequestsAfter?: string
} = {}) {
  const {
    repository: { issues, pullRequests },
  } = await octokit.graphql(
    `
    query GetOpenIssuesAndPullRequests($issuesAfter: String, $pullRequestsAfter: String) {
      repository(owner: "redwoodjs", name: "redwood") {
        issues(
          first: 100
          states: OPEN
          orderBy: { field: CREATED_AT, direction: ASC }
          after: $issuesAfter
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            url
          }
        }
        pullRequests(
          first: 100
          states: OPEN
          orderBy: { field: CREATED_AT, direction: ASC }
          after: $pullRequestsAfter
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            url
          }
        }
      }
    }
  `,
    { issuesAfter, pullRequestsAfter }
  )

  const issueURLs = issues.nodes.map((issue) => issue.url)
  const pullRequestURLs = pullRequests.nodes.map(
    (pullRequest) => pullRequest.url
  )

  if (!issues.pageInfo.hasNextPage && !pullRequests.pageInfo.hasNextPage) {
    return [...issueURLs, ...pullRequestURLs]
  }

  const next = await getOpenIssueAndPullRequestURLs({
    issuesAfter: issues.pageInfo.endCursor,
    pullRequestsAfter: pullRequests.pageInfo.endCursor,
  })

  return [...issueURLs, ...pullRequestURLs, ...next]
}
