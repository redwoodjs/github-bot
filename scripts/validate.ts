import {
  getProjectFieldAndValueNamesToIds,
  getProjectId,
} from 'api/src/services/projects/projects'
import {
  getOpenIssues,
  getOpenPullRequests,
  validateIssuesOrPullRequest,
} from 'api/src/services/validate/validate'
import { Cli, Command } from 'clipanion'

export default async () => {
  process.env.OWNER = 'redwoodjs'
  process.env.NAME = 'redwood'

  const [_node, _rwCli, _execCommand, _scriptName, _prismaFlag, ...args] =
    process.argv

  const cli = new Cli()
  cli.register(ValidateCommand)
  cli.runExit(args)
}

class ValidateCommand extends Command {
  async execute() {
    await getProjectId()
    await getProjectFieldAndValueNamesToIds()

    const issues = await getOpenIssues()
    const pullRequests = await getOpenPullRequests()
    let issuesOrPullRequests = [...issues, ...pullRequests]

    issuesOrPullRequests = issuesOrPullRequests
      .filter(
        (issueOrPullRequest) => issueOrPullRequest.author.login !== 'renovate'
      )
      .filter(
        (issueOrPullRequest) => !IGNORE_LIST.includes(issueOrPullRequest.id)
      )

    await Promise.allSettled(
      issuesOrPullRequests.map(validateIssuesOrPullRequest.bind(this))
    )
  }
}

const IGNORE_LIST = [
  /**
   * Dependency Dashboard
   * https://github.com/redwoodjs/redwood/issues/3795
   */
  'I_kwDOC2M2f84_pAWH',
  /**
   * [Docs] Working Guidelines
   * https://github.com/redwoodjs/redwood/issues/332
   */
  'MDU6SXNzdWU1ODczNDg1NTQ=',
  /**
   * We ❤️ #Hacktoberfest: Here's How to Contribute to Redwood
   * https://github.com/redwoodjs/redwood/issues/1266
   */
  'MDU6SXNzdWU3MTQxNjcwNjY=',
  /**
   * 📢 Community Help Wanted 📢 - Help QA the new & improved Tutorial!
   * https://github.com/redwoodjs/redwood/issues/4820
   */
  'I_kwDOC2M2f85F9rMr',
]
