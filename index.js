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
  // on pr closed
  // -> merged? -> add "next-release" milestone
  // -> closed? -> remove milestone
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

  // on issue opened
  // -> add to Current-Release-Sprint, New issues 
  app.on("issues.opened", async (context) => {
    const params = context.repo()

    const config = await context.config(fileName, defaultConfig)

    const projects = await context.octokit.projects.listForRepo(params)
    const project = projects.data.find((project) => project.name === config.project)

    const columns = await context.octokit.projects.listColumns({
      ...params,
      project_id: project.id
    })
    const column = columns.data.find((column) => column.name === config.column)

    // https://github.com/probot/probot/issues/931#issuecomment-489813390
    context.octokit.projects.createCard({
      column_id: column.id,
      content_type: 'Issue',
      content_id: context.payload.issue.id,
    })
  })
}
