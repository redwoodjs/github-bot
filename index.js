const fileName = 'config.yml'

const defaultConfig = {
  project: 'Current-Release-Sprint',
  column: 'New issues',
  milestone: 'next-release',
}

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */
module.exports = (app) => {
  app.on("pull_request.closed", async (context) => {
    const { pull_number, ...params } = context.pullRequest()

    let milestoneNumber = null

    if (context.payload.pull_request.merged) {
      const milestones = await context.octokit.issues.listMilestones(params)
      config = await context.config(fileName, defaultConfig)
      const milestone = milestones.data.find((milestone) => milestone.title === config.milestone)
      milestoneNumber = milestone.number
    }

    return context.octokit.issues.update({
      ...params,
      issue_number: pull_number,
      milestone: milestoneNumber
    })
  })
}
