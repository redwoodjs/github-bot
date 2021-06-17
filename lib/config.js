const fileName = 'config.yml'

const defaultConfig = {
  projectName: 'Current-Release-Sprint',
  newIssuesColumn: 'New issues',
  mergedMilestone: 'next-release',
  milestoneToColumn: {
    'future-release': 'On deck (help-wanted)',
    'next-release-priority': 'In progress (priority)',
  }
}

module.exports = {
  fileName,
  defaultConfig
}