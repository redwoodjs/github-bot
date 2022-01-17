// import fs from 'fs'
// import path from 'path'
import { getStaleIssuesAndPRs, commentIssueOrPR } from '$api/src/lib/github'

/**
 * Compose the query string.
 *
 * @see {@link https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests}
 */
export default async () => {
  // const issuesAndPRs = await getStaleIssuesAndPRs()
  // for (const issueOrPR of issuesAndPRs) {
  //   await commentIssueOrPR(issueOrPR)
  // }

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

  query.push(`repo:redwoodjs/redwood`)

  let createdAt: Date | string = new Date()
  createdAt.setDate(createdAt.getDate() - 14)
  createdAt = createdAt.toISOString().split('T').shift()
  query.push(`created:<=${createdAt}`)

  let updatedAt: Date | string = new Date()
  updatedAt.setDate(updatedAt.getDate() - 7)
  updatedAt = updatedAt.toISOString().split('T').shift()
  query.push(`updated:<=${updatedAt}`)

  console.log({ query: query.join(' ') })
}
