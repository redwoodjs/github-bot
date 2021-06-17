// cache based on owner, repo, resource
// cache looks like...
// Map(1) { 'owner:repo:resource' => // a globally unique id }
const cache = new Map()
const makeKey = ({ owner, repo, resource }) => [owner, repo, resource].join(':')

module.exports = {
  cache,
  makeKey
}